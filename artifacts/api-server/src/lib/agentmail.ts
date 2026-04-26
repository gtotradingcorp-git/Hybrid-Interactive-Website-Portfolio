// Thin AgentMail wrapper. Used by chat-action endpoints to send emails
// without each route re-implementing fetch + auth + error handling.
//
// We intentionally keep this minimal: a single `sendEmail` helper that
// matches the shape of the existing /v0/inboxes/.../messages/send endpoint
// already used by routes/contact.ts and routes/match.ts. Any future calendar
// invite (.ics) attachment is plumbed through the optional `attachments` field.

import { logger } from "./logger";

export const JOHN_INBOX = "cs_info@agentmail.to";
const AGENTMAIL_BASE = "https://api.agentmail.to";

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64-encoded
    contentType: string;
  }>;
}

export interface SendEmailResult {
  ok: boolean;
  status?: number;
  errorMessage?: string;
}

export function isAgentMailConfigured(): boolean {
  return Boolean(process.env["AGENTMAIL_API_KEY"]);
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env["AGENTMAIL_API_KEY"];
  if (!apiKey) {
    return { ok: false, errorMessage: "AGENTMAIL_API_KEY is not configured." };
  }
  try {
    const encodedInbox = encodeURIComponent(JOHN_INBOX);
    const body: Record<string, unknown> = {
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    };
    if (opts.cc) body["cc"] = opts.cc;
    if (opts.replyTo) body["reply_to"] = opts.replyTo;
    if (opts.attachments && opts.attachments.length > 0) {
      body["attachments"] = opts.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType,
      }));
    }
    const res = await fetch(
      `${AGENTMAIL_BASE}/v0/inboxes/${encodedInbox}/messages/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      logger.error(
        { status: res.status, errBody: errBody.slice(0, 200) },
        "AgentMail send failed",
      );
      return {
        ok: false,
        status: res.status,
        errorMessage: `AgentMail returned ${res.status}`,
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    logger.error({ err }, "AgentMail send threw");
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : "send failed",
    };
  }
}
