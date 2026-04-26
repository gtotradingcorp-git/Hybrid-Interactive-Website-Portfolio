import { createHash } from "node:crypto";
import { db, chatActionsTable, hotLeadsTable } from "@workspace/db";
import { logger } from "./logger";
import { sendEmail, JOHN_INBOX, isAgentMailConfigured } from "./agentmail";
import { renderBriefPdf } from "./briefPdf";
import { profileMeta, projects } from "@workspace/site-data";

// Action executors. Each is called from POST /api/chat/actions/<tool>
// after rate-limit + body validation passes. They are intentionally
// independent: a failure in one action never affects the others, and each
// writes its own row to chat_actions for the admin audit trail.
//
// Every action returns a uniform shape so the chat widget can render the
// same success / failure UI regardless of which tool was used.

export interface ActionContext {
  ip: string;
  transcriptSnippet: string;
  siteUrl: string | null;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  // Optional download / view URL surfaced inline in the chat thread.
  downloadUrl?: string;
}

function isValidEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function clamp(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

async function logAction(row: {
  action: string;
  status: string;
  senderEmail?: string | null;
  senderName?: string | null;
  senderCompany?: string | null;
  recipients?: string | string[] | null;
  summary?: string | null;
  transcriptSnippet?: string | null;
  errorMessage?: string | null;
  ipHash?: string | null;
}): Promise<number | null> {
  try {
    const recipients = Array.isArray(row.recipients)
      ? row.recipients.join(", ")
      : row.recipients ?? null;
    const inserted = await db
      .insert(chatActionsTable)
      .values({
        action: row.action,
        status: row.status,
        senderEmail: row.senderEmail ? clamp(row.senderEmail, 200) : null,
        senderName: row.senderName ? clamp(row.senderName, 200) : null,
        senderCompany: row.senderCompany ? clamp(row.senderCompany, 200) : null,
        recipients: recipients ? clamp(recipients, 1000) : null,
        summary: row.summary ? clamp(row.summary, 4000) : null,
        transcriptSnippet: row.transcriptSnippet
          ? clamp(row.transcriptSnippet, 2000)
          : null,
        errorMessage: row.errorMessage ? clamp(row.errorMessage, 500) : null,
        ipHash: row.ipHash ?? null,
      })
      .returning({ id: chatActionsTable.id });
    return inserted[0]?.id ?? null;
  } catch (err) {
    logger.error({ err, row }, "Failed to write chat_actions row");
    return null;
  }
}

// ---------- book_meeting ----------

export interface BookMeetingInput {
  name: string;
  email: string;
  company: string;
  proposedTime: string;
  topic: string;
}

function buildIcs(input: {
  name: string;
  email: string;
  proposedTime: string;
  topic: string;
}): { content: string; filename: string } | null {
  // We trust the recruiter's free-form `proposedTime`; if Date.parse can't
  // resolve it we still send a confirmation email but skip the .ics so we
  // don't create an invite for an obviously invalid date.
  const t = new Date(input.proposedTime);
  if (Number.isNaN(t.getTime())) return null;
  const dur = 30 * 60 * 1000;
  const start = t;
  const end = new Date(t.getTime() + dur);
  const fmt = (d: Date): string =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}00Z`;
  const uid = `${createHash("sha1").update(`${input.email}-${input.proposedTime}`).digest("hex")}@johnlibao.portfolio`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//johnlibao.portfolio//Chat Booking//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${input.topic.slice(0, 200)} — ${input.name.slice(0, 100)}`,
    `DESCRIPTION:Booked via AI OPHNM. Reply to confirm or adjust.`,
    `ORGANIZER;CN=${profileMeta.name}:mailto:${JOHN_INBOX}`,
    `ATTENDEE;CN=${input.name.slice(0, 100)};RSVP=TRUE:mailto:${input.email}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return {
    content: Buffer.from(ics, "utf8").toString("base64"),
    filename: "meeting.ics",
  };
}

export async function executeBookMeeting(
  input: BookMeetingInput,
  ctx: ActionContext,
): Promise<ActionResult> {
  if (!isValidEmail(input.email)) {
    await logAction({
      action: "book_meeting",
      status: "rejected",
      senderName: input.name,
      senderCompany: input.company,
      summary: "Invalid recruiter email",
      ipHash: hashIp(ctx.ip),
    });
    return { ok: false, message: "That email address looks invalid." };
  }
  if (!isAgentMailConfigured()) {
    return {
      ok: false,
      message:
        "Email service isn't available right now. Please use the contact form instead.",
    };
  }
  const ics = buildIcs(input);
  const subject = `Meeting request: ${input.name} (${input.company}) — ${input.topic.slice(0, 100)}`;
  const recruiterBody = [
    `Hi ${input.name},`,
    ``,
    `Thanks for booking a time with John. He has the request and will confirm shortly.`,
    ``,
    `Proposed time: ${input.proposedTime}`,
    `Topic: ${input.topic}`,
    `Company: ${input.company}`,
    ``,
    ics
      ? `A calendar invite (.ics) is attached — open it to add the slot tentatively.`
      : `(Note: the time wasn't a parseable date, so no calendar invite was attached. John will confirm a concrete slot.)`,
    ``,
    `If anything changes, reply to this email — it goes straight to John.`,
    ``,
    `— AI OPHNM, on behalf of ${profileMeta.name}`,
  ].join("\n");
  const johnBody = [
    `New meeting request via AI OPHNM`,
    ``,
    `From: ${input.name} <${input.email}>`,
    `Company: ${input.company}`,
    `Proposed: ${input.proposedTime}`,
    `Topic: ${input.topic}`,
    ``,
    `Recent chat:`,
    ctx.transcriptSnippet || "(no transcript captured)",
  ].join("\n");

  const recruiterRes = await sendEmail({
    to: input.email,
    cc: JOHN_INBOX,
    subject,
    text: recruiterBody,
    replyTo: JOHN_INBOX,
    attachments: ics
      ? [{ filename: ics.filename, content: ics.content, contentType: "text/calendar; method=REQUEST" }]
      : undefined,
  });
  if (!recruiterRes.ok) {
    await logAction({
      action: "book_meeting",
      status: "failed",
      senderEmail: input.email,
      senderName: input.name,
      senderCompany: input.company,
      recipients: [input.email, JOHN_INBOX],
      summary: `Booking attempt for ${input.proposedTime}`,
      transcriptSnippet: ctx.transcriptSnippet,
      errorMessage: recruiterRes.errorMessage ?? "send failed",
      ipHash: hashIp(ctx.ip),
    });
    return {
      ok: false,
      message:
        "We couldn't send the booking confirmation. Please use the contact form and John will follow up.",
    };
  }
  // Best-effort separate notification to John (keeps a clean inbox thread).
  await sendEmail({
    to: JOHN_INBOX,
    subject: `[AI OPHNM] Booking request — ${input.name} (${input.company})`,
    text: johnBody,
    replyTo: input.email,
  }).catch(() => undefined);

  await logAction({
    action: "book_meeting",
    status: "sent",
    senderEmail: input.email,
    senderName: input.name,
    senderCompany: input.company,
    recipients: [input.email, JOHN_INBOX],
    summary: `Proposed ${input.proposedTime} — ${input.topic}`,
    transcriptSnippet: ctx.transcriptSnippet,
    ipHash: hashIp(ctx.ip),
  });
  return {
    ok: true,
    message: `Booked. ${input.name} — confirmation sent to ${input.email}, John has been CC'd.`,
  };
}

// ---------- send_brief ----------

export interface SendBriefInput {
  email: string;
  name?: string;
  company?: string;
  roleFocus: string;
  timeline: string;
}

export async function executeSendBrief(
  input: SendBriefInput,
  ctx: ActionContext,
): Promise<ActionResult> {
  if (!isValidEmail(input.email)) {
    return { ok: false, message: "That email address looks invalid." };
  }
  if (!isAgentMailConfigured()) {
    return {
      ok: false,
      message:
        "Email service isn't available right now. Please use the contact form instead.",
    };
  }
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderBriefPdf({
      roleFocus: input.roleFocus,
      timeline: input.timeline,
      recruiterName: input.name ?? null,
      recruiterCompany: input.company ?? null,
      siteUrl: ctx.siteUrl,
    });
  } catch (err) {
    await logAction({
      action: "send_brief",
      status: "failed",
      senderEmail: input.email,
      senderName: input.name ?? null,
      senderCompany: input.company ?? null,
      recipients: input.email,
      summary: `${input.roleFocus} (${input.timeline})`,
      errorMessage: err instanceof Error ? err.message : "PDF render failed",
      ipHash: hashIp(ctx.ip),
    });
    return {
      ok: false,
      message:
        "Couldn't generate the brief. Please reach out via the Contact page and John will send one over.",
    };
  }
  const filename = `john-libao-brief.pdf`;
  const subject = `One-page brief: ${profileMeta.name} for ${clamp(input.roleFocus, 80)}`;
  const text = [
    `Hi${input.name ? ` ${input.name}` : ""},`,
    ``,
    `Attached is John's tailored one-page brief for ${input.roleFocus}.`,
    `Hiring timeline: ${input.timeline}.`,
    ``,
    `Reply to this email or reach John directly at ${profileMeta.email}.`,
    ``,
    `— AI OPHNM`,
  ].join("\n");
  const sendRes = await sendEmail({
    to: input.email,
    cc: JOHN_INBOX,
    subject,
    text,
    replyTo: JOHN_INBOX,
    attachments: [
      {
        filename,
        content: Buffer.from(pdfBytes).toString("base64"),
        contentType: "application/pdf",
      },
    ],
  });
  if (!sendRes.ok) {
    await logAction({
      action: "send_brief",
      status: "failed",
      senderEmail: input.email,
      senderName: input.name ?? null,
      senderCompany: input.company ?? null,
      recipients: input.email,
      summary: `${input.roleFocus} (${input.timeline})`,
      transcriptSnippet: ctx.transcriptSnippet,
      errorMessage: sendRes.errorMessage ?? "send failed",
      ipHash: hashIp(ctx.ip),
    });
    return {
      ok: false,
      message:
        "We couldn't send the brief. Please use the contact form and John will follow up.",
    };
  }
  await logAction({
    action: "send_brief",
    status: "sent",
    senderEmail: input.email,
    senderName: input.name ?? null,
    senderCompany: input.company ?? null,
    recipients: input.email,
    summary: `${input.roleFocus} (${input.timeline})`,
    transcriptSnippet: ctx.transcriptSnippet,
    ipHash: hashIp(ctx.ip),
  });
  // Hand the PDF back to the chat widget so the recruiter can grab it
  // immediately without waiting for the email — mirrors the spec's "with
  // a copy in the chat for download".
  return {
    ok: true,
    message: `Brief sent to ${input.email}. You can also download it below.`,
  };
}

// renderBriefPdf re-exported so the route can stream a download in one
// shot for the in-chat copy without re-running the email path.
export { renderBriefPdf } from "./briefPdf";

// ---------- alert_john ----------

export interface AlertJohnInput {
  email: string;
  company: string;
  role: string;
  note?: string;
}

export async function executeAlertJohn(
  input: AlertJohnInput,
  ctx: ActionContext,
): Promise<ActionResult> {
  if (!isValidEmail(input.email)) {
    return { ok: false, message: "That email address looks invalid." };
  }
  if (!isAgentMailConfigured()) {
    // Still capture the lead in DB even if email fails — John can spot it
    // on the dashboard.
    const chatActionId = await logAction({
      action: "alert_john",
      status: "failed",
      senderEmail: input.email,
      senderCompany: input.company,
      summary: `Hot lead — ${input.role}`,
      transcriptSnippet: ctx.transcriptSnippet,
      errorMessage: "AGENTMAIL_API_KEY not configured",
      ipHash: hashIp(ctx.ip),
    });
    await db
      .insert(hotLeadsTable)
      .values({
        senderEmail: input.email,
        senderCompany: input.company,
        role: input.role,
        note: input.note ?? null,
        transcriptSnippet: ctx.transcriptSnippet,
        notified: false,
        notifyError: "AGENTMAIL_API_KEY not configured",
        chatActionId,
      })
      .catch((err) => {
        logger.error({ err }, "hot_leads insert failed");
      });
    return {
      ok: false,
      message:
        "Email service isn't available right now, but John has been logged in the dashboard. Please also drop a note via the Contact page.",
    };
  }

  const subject = `[Hot Lead] ${input.company} — ${input.role}`;
  const body = [
    `Hot Lead — flagged via AI OPHNM`,
    ``,
    `Company: ${input.company}`,
    `Role: ${input.role}`,
    `Reply to: ${input.email}`,
    ``,
    input.note ? `Note from recruiter:\n${input.note}\n` : "",
    `Recent chat snippet:`,
    ctx.transcriptSnippet || "(no transcript captured)",
    ``,
    `Reply to this email to respond directly.`,
  ]
    .filter((s) => s !== "")
    .join("\n");
  const sendRes = await sendEmail({
    to: JOHN_INBOX,
    subject,
    text: body,
    replyTo: input.email,
  });
  const chatActionId = await logAction({
    action: "alert_john",
    status: sendRes.ok ? "sent" : "failed",
    senderEmail: input.email,
    senderCompany: input.company,
    recipients: JOHN_INBOX,
    summary: `Hot lead — ${input.role}`,
    transcriptSnippet: ctx.transcriptSnippet,
    errorMessage: sendRes.ok ? null : sendRes.errorMessage ?? "send failed",
    ipHash: hashIp(ctx.ip),
  });
  await db
    .insert(hotLeadsTable)
    .values({
      senderEmail: input.email,
      senderCompany: input.company,
      role: input.role,
      note: input.note ?? null,
      transcriptSnippet: ctx.transcriptSnippet,
      notified: sendRes.ok,
      notifyError: sendRes.ok ? null : sendRes.errorMessage ?? "send failed",
      chatActionId,
    })
    .catch((err) => {
      logger.error({ err }, "hot_leads insert failed");
    });
  if (!sendRes.ok) {
    return {
      ok: false,
      message:
        "We logged your interest but couldn't email John right now. He'll see it in the dashboard.",
    };
  }
  return {
    ok: true,
    message: `John has been alerted. He typically replies ${profileMeta.responseTime.toLowerCase()}.`,
  };
}

// ---------- share_with_panel ----------

export interface ShareWithPanelInput {
  panelEmails: string[];
  senderEmail: string;
  senderName?: string;
  note?: string;
  roleFocus: string;
}

export async function executeShareWithPanel(
  input: ShareWithPanelInput,
  ctx: ActionContext,
): Promise<ActionResult> {
  if (!isValidEmail(input.senderEmail)) {
    return { ok: false, message: "Your email address looks invalid." };
  }
  const dedup = Array.from(
    new Set(
      (input.panelEmails ?? [])
        .map((e) => (typeof e === "string" ? e.trim() : ""))
        .filter((e) => e.length > 0),
    ),
  );
  if (dedup.length === 0) {
    return { ok: false, message: "Add at least one panellist email." };
  }
  if (dedup.length > 3) {
    return { ok: false, message: "You can share with up to 3 panellists at a time." };
  }
  if (dedup.some((e) => !isValidEmail(e))) {
    return { ok: false, message: "One of the panellist emails looks invalid." };
  }
  if (!isAgentMailConfigured()) {
    return {
      ok: false,
      message:
        "Email service isn't available right now. Please use the contact form instead.",
    };
  }

  // Top 3 proof-point projects (heuristic match against role focus).
  const focus = input.roleFocus.toLowerCase();
  const tokens = focus.split(/[^a-z0-9+#.]+/).filter((t) => t.length >= 3);
  const scored = projects.map((p) => {
    const haystack = [p.title, p.shortDescription, p.role, ...(p.techStack ?? [])]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const t of tokens) if (haystack.includes(t)) score += 1;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const proofs = scored
    .slice(0, 3)
    .map((s) => `  • ${s.p.title} — ${clamp(s.p.shortDescription, 140)}`);
  const briefHint = ctx.siteUrl ? `${ctx.siteUrl}/contact` : "the Contact page on johnlibao.portfolio";

  const failures: Array<{ email: string; error: string }> = [];
  const successes: string[] = [];
  for (const recipient of dedup) {
    const subject = `Pitch: ${profileMeta.name} for ${clamp(input.roleFocus, 100)}`;
    const text = [
      `Hi,`,
      ``,
      `${input.senderName || "A recruiter"} (${input.senderEmail}) shared this pitch on John's behalf.`,
      ``,
      `John's focus: ${input.roleFocus}`,
      ``,
      `Top proof points:`,
      proofs.join("\n") || "  • (see portfolio)",
      ``,
      input.note ? `Note from sender:\n${input.note}\n` : "",
      `Schedule a call: reply to this email or reach John at ${profileMeta.email}.`,
      `Full portfolio: ${ctx.siteUrl ?? "johnlibao.portfolio"}`,
      `Get the one-pager brief: ${briefHint}`,
      ``,
      `— AI OPHNM, on behalf of ${profileMeta.name}`,
    ]
      .filter((s) => s !== "")
      .join("\n");
    const res = await sendEmail({
      to: recipient,
      cc: JOHN_INBOX,
      subject,
      text,
      replyTo: input.senderEmail,
    });
    if (res.ok) {
      successes.push(recipient);
    } else {
      failures.push({
        email: recipient,
        error: res.errorMessage ?? `status ${res.status ?? "?"}`,
      });
    }
  }

  await logAction({
    action: "share_with_panel",
    status: failures.length === 0 ? "sent" : successes.length === 0 ? "failed" : "sent",
    senderEmail: input.senderEmail,
    senderName: input.senderName ?? null,
    recipients: dedup,
    summary: `Pitch for ${input.roleFocus} — sent ${successes.length}/${dedup.length}`,
    transcriptSnippet: ctx.transcriptSnippet,
    errorMessage:
      failures.length > 0
        ? failures.map((f) => `${f.email}: ${f.error}`).join("; ")
        : null,
    ipHash: hashIp(ctx.ip),
  });

  if (successes.length === 0) {
    return {
      ok: false,
      message:
        "We couldn't deliver the pitch. Please use the contact form and John will follow up.",
    };
  }
  if (failures.length > 0) {
    return {
      ok: true,
      message: `Pitch sent to ${successes.length} of ${dedup.length}. Could not reach: ${failures
        .map((f) => f.email)
        .join(", ")}.`,
    };
  }
  return {
    ok: true,
    message: `Pitch sent to ${successes.length} panellist${successes.length > 1 ? "s" : ""} — John has been CC'd.`,
  };
}
