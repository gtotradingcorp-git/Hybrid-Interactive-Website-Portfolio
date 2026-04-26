import { sql } from "drizzle-orm";
import { db, costAlertsTable } from "@workspace/db";
import { estimateCostUsd } from "./usageSummary";
import { logger } from "./logger";
import { getCostAlertConfig } from "./costAlertConfig";

const INBOX_ID = "cs_info@agentmail.to";
const RECIPIENT = "cs_info@agentmail.to";
const AGENTMAIL_BASE = "https://api.agentmail.to";

export interface TodayUsage {
  day: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface CostAlertResult {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  usage?: TodayUsage;
  thresholdUsd?: number;
}

function todayUtcString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getDailyCostThresholdUsd(): number | null {
  const raw = process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function getTodayUsage(now: Date = new Date()): Promise<TodayUsage> {
  const day = todayUtcString(now);
  const rows = await db.execute<{
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }>(sql`
    select
      count(*)::int as requests,
      coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
      coalesce(sum(completion_tokens), 0)::bigint as completion_tokens,
      coalesce(sum(total_tokens), 0)::bigint as total_tokens
    from chat_logs
    where date_trunc('day', created_at at time zone 'UTC')
        = date_trunc('day', ${day}::timestamptz at time zone 'UTC')
  `);
  const list = rows.rows ?? (rows as unknown as Array<{
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }>);
  const r = list[0] ?? { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const promptTokens = Number(r.prompt_tokens);
  const completionTokens = Number(r.completion_tokens);
  return {
    day,
    requests: Number(r.requests),
    promptTokens,
    completionTokens,
    totalTokens: Number(r.total_tokens),
    estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens),
  };
}

export function renderCostAlertEmail(
  usage: TodayUsage,
  thresholdUsd: number,
): { subject: string; text: string } {
  const subject = `[ALERT] Chat cost today $${usage.estimatedCostUsd.toFixed(
    2,
  )} exceeded $${thresholdUsd.toFixed(2)} threshold (${usage.day})`;
  const text = [
    `Daily chat cost alert`,
    `Day (UTC): ${usage.day}`,
    ``,
    `Estimated cost so far: $${usage.estimatedCostUsd.toFixed(4)} USD`,
    `Threshold: $${thresholdUsd.toFixed(4)} USD`,
    ``,
    `Requests: ${usage.requests}`,
    `Prompt tokens: ${usage.promptTokens.toLocaleString()}`,
    `Completion tokens: ${usage.completionTokens.toLocaleString()}`,
    `Total tokens: ${usage.totalTokens.toLocaleString()}`,
    ``,
    `This alert fires once per UTC day. Investigate at /admin/usage.`,
  ].join("\n");
  return { subject, text };
}

async function sendViaAgentMail(subject: string, text: string): Promise<void> {
  const apiKey = process.env["AGENTMAIL_API_KEY"];
  if (!apiKey) {
    throw new Error("AGENTMAIL_API_KEY is not configured.");
  }
  const encodedInbox = encodeURIComponent(INBOX_ID);
  const res = await fetch(
    `${AGENTMAIL_BASE}/v0/inboxes/${encodedInbox}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: RECIPIENT, subject, text }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`AgentMail ${res.status}: ${errBody.slice(0, 200)}`);
  }
}

async function alreadySentToday(day: string): Promise<boolean> {
  const rows = await db.execute<{ id: number }>(sql`
    select id from cost_alerts
    where day = ${day} and status = 'sent'
    limit 1
  `);
  const list = rows.rows ?? (rows as unknown as Array<{ id: number }>);
  return list.length > 0;
}

export interface CheckOptions {
  /** Override the per-day threshold (USD). Defaults to the persisted config. */
  thresholdUsd?: number;
  /** Override the usage source (used by tests). */
  usageProvider?: (now: Date) => Promise<TodayUsage>;
  /** Override the email transport (used by tests). */
  send?: (subject: string, text: string) => Promise<void>;
  /** Inject the current time (used by tests). */
  now?: Date;
  /** Skip the dedupe check (used by tests). */
  force?: boolean;
}

/**
 * Check today's chat cost against the configured threshold and send a single
 * alert email if it has been crossed. Safe to call frequently — only one
 * "sent" row is recorded per UTC day, so additional calls are skipped.
 */
export async function checkAndSendCostAlert(
  opts: CheckOptions = {},
): Promise<CostAlertResult> {
  let threshold: number | null = opts.thresholdUsd ?? null;
  if (threshold == null) {
    const cfg = await getCostAlertConfig();
    threshold = cfg.thresholdUsd;
  }
  if (threshold == null) {
    return { status: "skipped", reason: "Cost alert threshold is not configured." };
  }

  const now = opts.now ?? new Date();
  const provider = opts.usageProvider ?? getTodayUsage;
  const usage = await provider(now);

  if (usage.estimatedCostUsd < threshold) {
    return { status: "skipped", reason: "Below threshold.", usage, thresholdUsd: threshold };
  }

  if (!opts.force) {
    // Fail closed: if the dedupe lookup itself errors (e.g. a transient DB
    // hiccup), skip rather than risk re-sending the same alert repeatedly.
    // The next throttle cycle will retry once the DB recovers.
    let sent: boolean;
    try {
      sent = await alreadySentToday(usage.day);
    } catch (err) {
      logger.warn(
        { err, day: usage.day },
        "Cost alert dedupe lookup failed; skipping to avoid duplicate sends",
      );
      return {
        status: "skipped",
        reason: "Dedupe lookup failed; skipping send.",
        usage,
        thresholdUsd: threshold,
      };
    }
    if (sent) {
      return { status: "skipped", reason: "Already alerted today.", usage, thresholdUsd: threshold };
    }
  }

  const transport = opts.send ?? sendViaAgentMail;
  const { subject, text } = renderCostAlertEmail(usage, threshold);

  try {
    await transport(subject, text);
    await db.insert(costAlertsTable).values({
      day: usage.day,
      requests: usage.requests,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      thresholdUsd: threshold,
      status: "sent",
    });
    logger.warn(
      {
        day: usage.day,
        requests: usage.requests,
        estimatedCostUsd: usage.estimatedCostUsd,
        thresholdUsd: threshold,
      },
      "Daily cost alert sent",
    );
    return { status: "sent", usage, thresholdUsd: threshold };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Failed to send daily cost alert");
    await db
      .insert(costAlertsTable)
      .values({
        day: usage.day,
        requests: usage.requests,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        thresholdUsd: threshold,
        status: "failed",
        errorMessage: message.slice(0, 1000),
      })
      .catch(() => {
        /* swallow logging failure */
      });
    return { status: "failed", reason: message, usage, thresholdUsd: threshold };
  }
}

// Throttle: at most one DB usage check per minute per process, to keep the
// chat hot path cheap even under burst traffic. The dedupe guard above still
// guarantees only one alert email per UTC day.
let lastCheckAt = 0;
const THROTTLE_MS = 60_000;

/**
 * Fire-and-forget cost-alert check intended to be called from the chat
 * request hot path after each usage log write. No-op if the last check ran
 * less than a minute ago. The check itself fast-skips when no threshold is
 * configured (env var or persisted admin config), so this stays cheap.
 */
export function maybeCheckCostAlert(): void {
  const now = Date.now();
  if (now - lastCheckAt < THROTTLE_MS) return;
  lastCheckAt = now;
  checkAndSendCostAlert().catch((err) => {
    logger.error({ err }, "Cost alert check crashed");
  });
}

/** Test helper: reset the in-memory throttle. */
export function _resetCostAlertThrottle(): void {
  lastCheckAt = 0;
}
