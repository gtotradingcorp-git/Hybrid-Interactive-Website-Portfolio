import { Router, type IRouter, type Request, type Response } from "express";
import { buildSystemPrompt } from "../lib/knowledgeBase";
import { classifyTopic, classifyTopicWithAI, type ChatTopic } from "../lib/topicClassifier";
import { db, chatLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { SseChatParser, type SseToolCallDelta } from "../lib/sseParser";
import { maybeCheckCostAlert } from "../lib/costAlert";
import { createRateLimiter, createRouteRateLimiter, getClientIp } from "../lib/rateLimit";
import { CHAT_TOOLS, isChatToolName, type ChatToolName } from "../lib/chatTools";
import {
  executeBookMeeting,
  executeSendBrief,
  executeAlertJohn,
  executeShareWithPanel,
  renderBriefPdf,
  type ActionContext,
} from "../lib/chatActions";

// gpt-4o-mini is a pure (non-reasoning) chat completion model — it streams
// answer tokens immediately, so first-token latency stays low. Reasoning
// models (o-series, gpt-5*) consume hundreds of "thinking" tokens before any
// visible content, which felt like the chat was "stuck" on IT/DevOps prompts.
const CHAT_MODEL = "gpt-4o-mini";

// Upstream timeout for the OpenAI request. If the model has not started
// streaming (or has stalled mid-stream) within this window, we abort and
// surface a friendly error to the client instead of leaving the typing
// indicator spinning forever.
const UPSTREAM_TIMEOUT_MS = (() => {
  const raw = process.env["CHAT_UPSTREAM_TIMEOUT_MS"];
  if (!raw) return 20_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 20_000;
})();

const router: IRouter = Router();

const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 2000;

// Per-IP rate limiter: 12 req/min and 200 req/day. Backed by the durable
// Postgres-backed limiter so counters survive restarts and are shared
// across replicas — a single attacker cannot multiply their allowance by
// hitting different processes. Tests opt into the in-memory backend via
// RATE_LIMIT_BACKEND=memory.
const chatRateLimiter = createRouteRateLimiter("chat", [
  { windowMs: 60_000, max: 12, reason: "Too many requests. Please wait a moment." },
  { windowMs: 24 * 60 * 60 * 1000, max: 200, reason: "Daily chat limit reached. Please try again tomorrow." },
]);

// Per-IP action limiter — actions actually send email + create DB rows so
// they're capped tighter than chat itself. 5/min, 30/day matches the
// contact-form / Recruiter-Mode share posture.
const actionRateLimiter = createRateLimiter([
  { windowMs: 60_000, max: 5, reason: "Too many actions. Please wait a moment." },
  {
    windowMs: 24 * 60 * 60 * 1000,
    max: 30,
    reason: "Daily action limit reached. Please try again tomorrow.",
  },
]);

// Exposed for tests so they can run independently of prior calls.
export async function _resetChatRateLimit(): Promise<void> {
  await chatRateLimiter.reset();
  actionRateLimiter.reset();
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Prefer the Replit AI Integrations proxy when configured (no per-user quota,
// billed against the project's credits). Fall back to a direct OpenAI key only
// if the proxy isn't set up.
const AI_BASE_URL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const AI_API_KEY = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const FALLBACK_API_KEY = process.env["OPENAI_API_KEY"];

// Resolve base URL + API key as a matched pair. Mixing the integrations base
// URL with the direct OpenAI key (or vice-versa) would cause hard auth
// failures, so we only switch to the integrations proxy when BOTH the proxy
// URL and proxy key are set.
const USE_AI_INTEGRATIONS = Boolean(AI_BASE_URL && AI_API_KEY);
const RESOLVED_BASE_URL = (
  USE_AI_INTEGRATIONS ? AI_BASE_URL! : "https://api.openai.com/v1"
).replace(/\/$/, "");
const RESOLVED_API_KEY = USE_AI_INTEGRATIONS ? AI_API_KEY! : (FALLBACK_API_KEY ?? "");

const HAS_OPENAI_CONFIG = USE_AI_INTEGRATIONS || Boolean(FALLBACK_API_KEY);

// Accumulate streaming tool-call deltas into a complete tool call. OpenAI
// emits the function name in the first delta and the JSON arguments in
// chunks afterward — we concatenate by `index` so multiple parallel
// tool-calls don't get smashed together.
interface AccumulatedToolCall {
  id?: string;
  name?: string;
  arguments: string;
}

function applyDeltas(
  acc: Map<number, AccumulatedToolCall>,
  deltas: SseToolCallDelta[],
): void {
  for (const d of deltas) {
    const slot = acc.get(d.index) ?? { arguments: "" };
    if (d.id) slot.id = d.id;
    if (d.name) slot.name = d.name;
    if (d.argumentsDelta) slot.arguments += d.argumentsDelta;
    acc.set(d.index, slot);
  }
}

function siteUrlFromReq(req: Request): string | null {
  const env = process.env["PUBLIC_SITE_URL"];
  if (env) return env.replace(/\/$/, "");
  const host = req.get("host");
  if (!host) return null;
  const proto = req.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}

router.post("/chat", async (req: Request, res: Response) => {
  const ip = getClientIp(req);

  const limit = await chatRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }

  const { messages } = req.body as { messages?: ChatMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required." });
    return;
  }

  const cleaned: ChatMessage[] = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MESSAGE_LENGTH),
    }));

  if (cleaned.length === 0 || cleaned[cleaned.length - 1]?.role !== "user") {
    res.status(400).json({ error: "Last message must be from the user." });
    return;
  }

  if (!HAS_OPENAI_CONFIG) {
    console.error("No OpenAI credentials configured (AI integrations proxy or OPENAI_API_KEY).");
    res.status(500).json({
      error:
        "The chat assistant is not available right now. Please contact John directly at cs_info@agentmail.to or via the Contact page.",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Cancel upstream OpenAI request if the client disconnects or upstream stalls.
  // NOTE: Use `res.on("close")` rather than `req.on("close")`. In Express 5 /
  // Node 22, the request stream's "close" event fires as soon as the request
  // body has been fully consumed (which happens immediately for small POSTs),
  // which would prematurely abort the upstream OpenAI call. The response
  // stream's "close" event fires only when the actual TCP connection is
  // terminated, which is what we actually want.
  const abortController = new AbortController();
  let clientClosed = false;
  let timedOut = false;
  const onClose = () => {
    if (res.writableEnded) return;
    clientClosed = true;
    abortController.abort();
  };
  res.on("close", onClose);

  // Reset the upstream timeout on every chunk we successfully receive, so a
  // long answer is fine but a stall (no tokens for UPSTREAM_TIMEOUT_MS) aborts.
  let timeoutHandle: NodeJS.Timeout | null = null;
  const armTimeout = () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(() => {
      console.log("[chat] upstream timeout fired");
      timedOut = true;
      abortController.abort();
    }, UPSTREAM_TIMEOUT_MS);
  };
  const clearUpstreamTimeout = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  };

  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  const toolCallAcc = new Map<number, AccumulatedToolCall>();
  let finishReason: string | null = null;

  // Kick off topic classification in parallel with the chat call so the
  // extra LLM round-trip doesn't add latency to the visitor's response.
  // We only await this just before logging, after the stream is done.
  const lastUserContent = cleaned[cleaned.length - 1]?.content ?? "";
  const topicPromise: Promise<ChatTopic> = classifyTopicWithAI(lastUserContent).catch(
    () => classifyTopic(lastUserContent),
  );

  try {
    armTimeout();
    const upstreamRes = await fetch(`${RESOLVED_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESOLVED_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_completion_tokens: 600,
        stream: true,
        stream_options: { include_usage: true },
        tools: CHAT_TOOLS,
        // "auto" lets the model decide when it has enough info to call a
        // tool. Combined with the system-prompt rules ("only call when
        // required fields are present"), this avoids premature calls.
        tool_choice: "auto",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          ...cleaned,
        ],
      }),
      signal: abortController.signal,
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      const text = await upstreamRes.text().catch(() => "");
      throw new Error(`Upstream ${upstreamRes.status}: ${text.slice(0, 200)}`);
    }

    const reader = upstreamRes.body.getReader();
    const parser = new SseChatParser();

    while (true) {
      if (clientClosed) {
        try { await reader.cancel(); } catch { /* noop */ }
        break;
      }
      const { value, done } = await reader.read();
      if (done) break;
      armTimeout();
      const events = parser.push(value);
      for (const evt of events) {
        if (evt.content) {
          res.write(`data: ${JSON.stringify({ content: evt.content })}\n\n`);
        }
        if (evt.toolCalls) {
          applyDeltas(toolCallAcc, evt.toolCalls);
        }
        if (evt.finishReason) {
          finishReason = evt.finishReason;
        }
        if (evt.usage) {
          promptTokens = evt.usage.prompt_tokens ?? 0;
          completionTokens = evt.usage.completion_tokens ?? 0;
          totalTokens = evt.usage.total_tokens ?? 0;
        }
      }
    }

    if (!clientClosed) {
      // If the model called a tool, surface the first valid call as an
      // `action_request` event. We deliberately only emit one card per
      // response — multi-action confirmation flows would overwhelm the chat.
      if (finishReason === "tool_calls" && toolCallAcc.size > 0) {
        const firstSlot = [...toolCallAcc.entries()].sort(
          ([a], [b]) => a - b,
        )[0]?.[1];
        if (firstSlot && firstSlot.name && isChatToolName(firstSlot.name)) {
          let parsedArgs: unknown = {};
          try {
            parsedArgs = firstSlot.arguments ? JSON.parse(firstSlot.arguments) : {};
          } catch {
            parsedArgs = {};
          }
          res.write(
            `data: ${JSON.stringify({
              action_request: {
                tool: firstSlot.name as ChatToolName,
                arguments: parsedArgs,
              },
            })}\n\n`,
          );
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (err) {
    if (clientClosed && !timedOut) {
      return;
    }
    if (!timedOut && (err as Error)?.name === "AbortError") {
      return;
    }
    if (!timedOut) {
      console.error("Chat stream error:", err);
    } else {
      console.warn("Chat stream timed out after", UPSTREAM_TIMEOUT_MS, "ms");
    }

    // Sanitize the client-facing message so that raw upstream error details
    // (including auth error text that may reference the API key) are never
    // forwarded to the visitor. Only a fixed friendly message is returned.
    const isAuthError =
      !timedOut &&
      err instanceof Error &&
      (/401|403|invalid.*api.*key|authentication|unauthorized/i.test(err.message));

    const clientMessage = timedOut
      ? "The assistant is taking longer than expected. Please try again, or reach out via the Contact page."
      : isAuthError
        ? "The chat assistant is not available right now. Please contact John directly at cs_info@agentmail.to or via the Contact page."
        : "Something went wrong with the chat assistant. Please try again or reach out via the Contact page.";

    if (!res.headersSent) {
      res.status(timedOut ? 504 : 500).json({ error: clientMessage });
      return;
    }
    res.write(`data: ${JSON.stringify({ error: clientMessage })}\n\n`);
    res.end();
  } finally {
    clearUpstreamTimeout();
    res.off("close", onClose);
    // Log usage (no PII; only the inferred topic of the latest user question).
    // Always log when we have usage data, even if the client disconnected, since
    // tokens were still consumed.
    if (totalTokens > 0 || promptTokens > 0) {
      // Cap the stored question to keep rows compact in the dashboard view.
      // The full message is never persisted; only this truncated snippet is.
      const storedQuestion = lastUserContent.slice(0, 500);
      topicPromise
        .then((topic) =>
          db.insert(chatLogsTable).values({
            topic,
            model: CHAT_MODEL,
            promptTokens,
            completionTokens,
            totalTokens,
            question: storedQuestion,
          }),
        )
        .then(() => {
          // Proactively check whether today's running cost has crossed the
          // configured alert threshold. Throttled + deduped internally so
          // this is safe and cheap to call on every chat completion.
          maybeCheckCostAlert();
        })
        .catch((logErr) => {
          logger.error({ err: logErr }, "Failed to write chat usage log");
        });
    } else {
      // Avoid an unhandled rejection if we never reach the logging branch.
      topicPromise.catch(() => {});
    }
  }
});

// ---------- Action endpoints ----------
// Each tool the model can propose is fronted by a thin route handler that
// validates the body, applies the per-IP action limiter, and dispatches to
// the executor in lib/chatActions. The executors handle all email + DB
// writes and return a uniform { ok, message, downloadUrl? } shape.

function buildActionContext(req: Request): ActionContext {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const transcript = typeof body["transcript"] === "string" ? (body["transcript"] as string) : "";
  return {
    ip: getClientIp(req),
    transcriptSnippet: transcript.slice(0, 2000),
    siteUrl: siteUrlFromReq(req),
  };
}

router.post("/chat/actions/book_meeting", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = actionRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }
  const args = (req.body?.arguments ?? {}) as Record<string, unknown>;
  const name = String(args["name"] ?? "").trim().slice(0, 200);
  const email = String(args["email"] ?? "").trim().slice(0, 200);
  const company = String(args["company"] ?? "").trim().slice(0, 200);
  const proposedTime = String(args["proposedTime"] ?? "").trim().slice(0, 200);
  const topic = String(args["topic"] ?? "").trim().slice(0, 200);
  if (!name || !email || !company || !proposedTime || !topic) {
    res.status(400).json({ ok: false, message: "Missing required fields." });
    return;
  }
  try {
    const result = await executeBookMeeting(
      { name, email, company, proposedTime, topic },
      buildActionContext(req),
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, "book_meeting failed");
    res.status(500).json({
      ok: false,
      message: "We couldn't process that. Please use the contact form.",
    });
  }
});

router.post("/chat/actions/send_brief", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = actionRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }
  const args = (req.body?.arguments ?? {}) as Record<string, unknown>;
  const email = String(args["email"] ?? "").trim().slice(0, 200);
  const name = String(args["name"] ?? "").trim().slice(0, 200) || undefined;
  const company = String(args["company"] ?? "").trim().slice(0, 200) || undefined;
  const roleFocus = String(args["roleFocus"] ?? "").trim().slice(0, 300);
  const timeline = String(args["timeline"] ?? "").trim().slice(0, 200);
  if (!email || !roleFocus || !timeline) {
    res.status(400).json({ ok: false, message: "Missing required fields." });
    return;
  }
  try {
    const result = await executeSendBrief(
      { email, name, company, roleFocus, timeline },
      buildActionContext(req),
    );
    res.json({
      ...result,
      downloadUrl: result.ok
        ? `/api/chat/brief/preview?roleFocus=${encodeURIComponent(roleFocus)}&timeline=${encodeURIComponent(timeline)}${name ? `&name=${encodeURIComponent(name)}` : ""}${company ? `&company=${encodeURIComponent(company)}` : ""}`
        : undefined,
    });
  } catch (err) {
    logger.error({ err }, "send_brief failed");
    res.status(500).json({
      ok: false,
      message: "We couldn't process that. Please use the contact form.",
    });
  }
});

router.post("/chat/actions/alert_john", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = actionRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }
  const args = (req.body?.arguments ?? {}) as Record<string, unknown>;
  const email = String(args["email"] ?? "").trim().slice(0, 200);
  const company = String(args["company"] ?? "").trim().slice(0, 200);
  const role = String(args["role"] ?? "").trim().slice(0, 200);
  const note = String(args["note"] ?? "").trim().slice(0, 1000) || undefined;
  if (!email || !company || !role) {
    res.status(400).json({ ok: false, message: "Missing required fields." });
    return;
  }
  try {
    const result = await executeAlertJohn(
      { email, company, role, note },
      buildActionContext(req),
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, "alert_john failed");
    res.status(500).json({
      ok: false,
      message: "We couldn't process that. Please use the contact form.",
    });
  }
});

router.post("/chat/actions/share_with_panel", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = actionRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }
  const args = (req.body?.arguments ?? {}) as Record<string, unknown>;
  const panelEmails = Array.isArray(args["panelEmails"])
    ? (args["panelEmails"] as unknown[]).map((s) => String(s ?? "").trim()).filter(Boolean)
    : [];
  const senderEmail = String(args["senderEmail"] ?? "").trim().slice(0, 200);
  const senderName = String(args["senderName"] ?? "").trim().slice(0, 200) || undefined;
  const note = String(args["note"] ?? "").trim().slice(0, 1000) || undefined;
  const roleFocus = String(args["roleFocus"] ?? "").trim().slice(0, 300);
  if (panelEmails.length === 0 || !senderEmail || !roleFocus) {
    res.status(400).json({ ok: false, message: "Missing required fields." });
    return;
  }
  try {
    const result = await executeShareWithPanel(
      { panelEmails, senderEmail, senderName, note, roleFocus },
      buildActionContext(req),
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, "share_with_panel failed");
    res.status(500).json({
      ok: false,
      message: "We couldn't process that. Please use the contact form.",
    });
  }
});

// In-chat copy of the brief PDF. Only callable after a send_brief action
// succeeded (the route returns this URL in `downloadUrl`). We intentionally
// don't store any state here — the URL carries everything needed to re-render.
router.get("/chat/brief/preview", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const limit = actionRateLimiter.check(ip);
  if (!limit.ok) {
    res.status(429).json({ error: limit.reason });
    return;
  }
  const roleFocus = String(req.query["roleFocus"] ?? "").slice(0, 300);
  const timeline = String(req.query["timeline"] ?? "").slice(0, 200);
  const name = String(req.query["name"] ?? "").slice(0, 200) || null;
  const company = String(req.query["company"] ?? "").slice(0, 200) || null;
  if (!roleFocus || !timeline) {
    res.status(400).json({ error: "Missing role focus or timeline." });
    return;
  }
  try {
    const pdf = await renderBriefPdf({
      roleFocus,
      timeline,
      recruiterName: name,
      recruiterCompany: company,
      siteUrl: siteUrlFromReq(req),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="john-libao-brief.pdf"`,
    );
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(Buffer.from(pdf));
  } catch (err) {
    logger.error({ err }, "brief preview render failed");
    res.status(500).json({ error: "Could not render brief." });
  }
});

export default router;
