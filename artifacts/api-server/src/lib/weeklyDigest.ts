import { sql } from "drizzle-orm";
import { db, weeklyDigestsTable } from "@workspace/db";
import { getUsageSummary, type UsageSummary } from "./usageSummary";
import { logger } from "./logger";
import { getDigestConfig, type DigestConfig } from "./digestConfig";

const INBOX_ID = "cs_info@agentmail.to";
const AGENTMAIL_BASE = "https://api.agentmail.to";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Send if it's been at least 6.5 days since the last successful send so a
// weekly cadence isn't pushed late by minor scheduler drift.
const MIN_INTERVAL_MS = Math.floor(WEEK_MS - 12 * 60 * 60 * 1000);

export interface DigestSendResult {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  summary?: UsageSummary;
  recipients?: string[];
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function renderDigestEmail(summary: UsageSummary): { subject: string; text: string } {
  const start = formatDate(summary.periodStart);
  const end = formatDate(summary.periodEnd);
  const { totals, byTopic, daily } = summary;

  const subject = `Weekly chat usage: ${totals.requests} requests, $${totals.estimatedCostUsd.toFixed(2)} (${start} – ${end})`;

  const topTopics = byTopic.slice(0, 5);
  const topicLines = topTopics.length
    ? topTopics.map((t) => `  - ${t.topic}: ${t.requests} requests, ${t.tokens.toLocaleString()} tokens`).join("\n")
    : "  (no chat activity this week)";

  const dailyLines = daily.length
    ? daily.map((d) => `  ${d.day}: ${d.requests} requests, ${d.tokens.toLocaleString()} tokens`).join("\n")
    : "  (no chat activity this week)";

  const text = [
    `Weekly chat usage summary`,
    `Period: ${start} – ${end} (${summary.windowDays} days)`,
    ``,
    `Totals`,
    `  Requests: ${totals.requests}`,
    `  Prompt tokens: ${totals.promptTokens.toLocaleString()}`,
    `  Completion tokens: ${totals.completionTokens.toLocaleString()}`,
    `  Total tokens: ${totals.totalTokens.toLocaleString()}`,
    `  Estimated cost: $${totals.estimatedCostUsd.toFixed(4)} USD`,
    ``,
    `Top topics`,
    topicLines,
    ``,
    `Daily breakdown`,
    dailyLines,
    ``,
    `View the full dashboard at /admin/usage.`,
  ].join("\n");

  return { subject, text };
}

async function sendViaAgentMail(
  recipients: string[],
  subject: string,
  text: string,
): Promise<void> {
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
      body: JSON.stringify({ to: recipients, subject, text }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`AgentMail ${res.status}: ${errBody.slice(0, 200)}`);
  }
}

async function getLastSuccessfulSendAt(): Promise<Date | null> {
  const rows = await db.execute<{ sent_at: string }>(sql`
    select sent_at from weekly_digests
    where status = 'sent'
    order by sent_at desc
    limit 1
  `);
  const list = rows.rows ?? (rows as unknown as Array<{ sent_at: string }>);
  const first = list[0];
  return first ? new Date(first.sent_at) : null;
}

export interface SendOptions {
  /** Bypass the "already sent this week" and day/hour/paused gates. */
  force?: boolean;
  /** Override the summary source (used by tests). */
  summaryProvider?: (windowDays: number) => Promise<UsageSummary>;
  /** Override the email transport (used by tests). */
  send?: (recipients: string[], subject: string, text: string) => Promise<void>;
  /** Override the configuration source (used by tests). */
  configProvider?: () => Promise<DigestConfig>;
  /** Inject the current time (used by tests). */
  now?: Date;
}

export async function sendWeeklyDigest(opts: SendOptions = {}): Promise<DigestSendResult> {
  const config = await (opts.configProvider ?? getDigestConfig)();
  const now = opts.now ?? new Date();

  if (!opts.force) {
    if (config.paused) {
      return { status: "skipped", reason: "Digest is paused." };
    }
    if (config.sendDay !== null && now.getUTCDay() !== config.sendDay) {
      return { status: "skipped", reason: "Not the configured send day." };
    }
    if (config.sendHour !== null && now.getUTCHours() !== config.sendHour) {
      return { status: "skipped", reason: "Not the configured send hour." };
    }
    const last = await getLastSuccessfulSendAt().catch(() => null);
    if (last && now.getTime() - last.getTime() < MIN_INTERVAL_MS) {
      return { status: "skipped", reason: "Already sent within the past week." };
    }
  }

  if (config.recipients.length === 0) {
    return { status: "skipped", reason: "No recipients configured." };
  }

  const provider = opts.summaryProvider ?? getUsageSummary;
  const transport = opts.send ?? sendViaAgentMail;
  const summary = await provider(7);
  const { subject, text } = renderDigestEmail(summary);

  try {
    await transport(config.recipients, subject, text);
    await db.insert(weeklyDigestsTable).values({
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      requests: summary.totals.requests,
      totalTokens: summary.totals.totalTokens,
      estimatedCostUsd: summary.totals.estimatedCostUsd,
      status: "sent",
    });
    logger.info(
      {
        requests: summary.totals.requests,
        totalTokens: summary.totals.totalTokens,
        estimatedCostUsd: summary.totals.estimatedCostUsd,
        recipients: config.recipients,
      },
      "Weekly digest sent",
    );
    return { status: "sent", summary, recipients: config.recipients };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Failed to send weekly digest");
    await db
      .insert(weeklyDigestsTable)
      .values({
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        requests: summary.totals.requests,
        totalTokens: summary.totals.totalTokens,
        estimatedCostUsd: summary.totals.estimatedCostUsd,
        status: "failed",
        errorMessage: message.slice(0, 1000),
      })
      .catch(() => {
        /* swallow logging failure */
      });
    return { status: "failed", reason: message, recipients: config.recipients };
  }
}

/**
 * Start the durable weekly digest scheduler. State (next planned run, last
 * run timestamp/status) is stored in the `digest_schedule` table so the
 * cadence is precise across deploys/restarts and observable from SQL.
 */
export async function startWeeklyDigestScheduler(): Promise<void> {
  const { startDurableDigestScheduler } = await import("./digestScheduler");
  await startDurableDigestScheduler();
}

export async function stopWeeklyDigestScheduler(): Promise<void> {
  const { stopDurableDigestScheduler } = await import("./digestScheduler");
  stopDurableDigestScheduler();
}
