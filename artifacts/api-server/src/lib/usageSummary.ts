import { sql } from "drizzle-orm";
import { db, chatLogsTable } from "@workspace/db";

export interface UsageSummary {
  windowDays: number;
  periodStart: Date;
  periodEnd: Date;
  previousPeriodStart: Date;
  previousPeriodEnd: Date;
  totals: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  daily: Array<{ day: string; requests: number; tokens: number }>;
  byTopic: Array<{ topic: string; requests: number; tokens: number }>;
  // Per-topic counts for the immediately preceding window of the same length,
  // so the dashboard can render a vs-previous-period delta without a second
  // round-trip. Topics absent from the current window are still included so
  // the UI can also surface "fell off" topics if it chooses to.
  previousByTopic: Array<{ topic: string; requests: number; tokens: number }>;
}

// gpt-4o pricing (USD per 1M tokens): $2.50 input, $10.00 output.
const PRICE_PROMPT_PER_M = 2.5;
const PRICE_COMPLETION_PER_M = 10.0;

export function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const cost =
    (promptTokens / 1_000_000) * PRICE_PROMPT_PER_M +
    (completionTokens / 1_000_000) * PRICE_COMPLETION_PER_M;
  return Number(cost.toFixed(4));
}

export async function getUsageSummary(windowDays: number): Promise<UsageSummary> {
  const periodEnd = new Date();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const periodStart = new Date(periodEnd.getTime() - windowMs);
  // Previous window: same length, immediately preceding the current one.
  const previousPeriodEnd = periodStart;
  const previousPeriodStart = new Date(previousPeriodEnd.getTime() - windowMs);
  const since = sql`${periodStart.toISOString()}::timestamptz`;
  const prevSince = sql`${previousPeriodStart.toISOString()}::timestamptz`;
  const prevUntil = sql`${previousPeriodEnd.toISOString()}::timestamptz`;

  const [totalsRow] = await db
    .select({
      totalRequests: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${chatLogsTable.totalTokens}), 0)::bigint`,
      promptTokens: sql<number>`coalesce(sum(${chatLogsTable.promptTokens}), 0)::bigint`,
      completionTokens: sql<number>`coalesce(sum(${chatLogsTable.completionTokens}), 0)::bigint`,
    })
    .from(chatLogsTable)
    .where(sql`${chatLogsTable.createdAt} >= ${since}`);

  const dailyRows = await db.execute<{
    day: string;
    requests: number;
    tokens: number;
  }>(sql`
    select
      to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
      count(*)::int as requests,
      coalesce(sum(total_tokens), 0)::bigint as tokens
    from chat_logs
    where created_at >= ${since}
    group by 1
    order by 1 asc
  `);

  const topicRows = await db.execute<{
    topic: string;
    requests: number;
    tokens: number;
  }>(sql`
    select
      topic,
      count(*)::int as requests,
      coalesce(sum(total_tokens), 0)::bigint as tokens
    from chat_logs
    where created_at >= ${since}
    group by topic
    order by requests desc
  `);

  // Same shape as the current-period byTopic, but bounded to the immediately
  // preceding window so the dashboard can render a vs-previous-period delta.
  const previousTopicRows = await db.execute<{
    topic: string;
    requests: number;
    tokens: number;
  }>(sql`
    select
      topic,
      count(*)::int as requests,
      coalesce(sum(total_tokens), 0)::bigint as tokens
    from chat_logs
    where created_at >= ${prevSince} and created_at < ${prevUntil}
    group by topic
    order by requests desc
  `);

  const promptTokens = Number(totalsRow?.promptTokens ?? 0);
  const completionTokens = Number(totalsRow?.completionTokens ?? 0);

  return {
    windowDays,
    periodStart,
    periodEnd,
    previousPeriodStart,
    previousPeriodEnd,
    totals: {
      requests: Number(totalsRow?.totalRequests ?? 0),
      promptTokens,
      completionTokens,
      totalTokens: Number(totalsRow?.totalTokens ?? 0),
      estimatedCostUsd: estimateCostUsd(promptTokens, completionTokens),
    },
    daily: (dailyRows.rows ?? (dailyRows as unknown as Array<{ day: string; requests: number; tokens: number }>)).map((r) => ({
      day: r.day,
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    })),
    byTopic: (topicRows.rows ?? (topicRows as unknown as Array<{ topic: string; requests: number; tokens: number }>)).map((r) => ({
      topic: r.topic,
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    })),
    previousByTopic: (previousTopicRows.rows ?? (previousTopicRows as unknown as Array<{ topic: string; requests: number; tokens: number }>)).map((r) => ({
      topic: r.topic,
      requests: Number(r.requests),
      tokens: Number(r.tokens),
    })),
  };
}
