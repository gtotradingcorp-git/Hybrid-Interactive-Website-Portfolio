import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

export const RETENTION_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = DAY_MS;

let timerHandle: NodeJS.Timeout | null = null;
let stopped = false;

export async function purgeStaleDemoEvents(
  retentionDays: number = RETENTION_DAYS,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const result = await db.execute(sql`
    delete from demo_events
    where created_at < ${cutoff.toISOString()}::timestamptz
  `);
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

async function tick(): Promise<void> {
  try {
    const deleted = await purgeStaleDemoEvents();
    if (deleted > 0) {
      logger.info({ deleted, retentionDays: RETENTION_DAYS }, "Purged stale demo_events rows");
    }
  } catch (err) {
    logger.error({ err }, "demo_events purge failed; will retry next cycle");
  }
}

function scheduleNext(): void {
  if (stopped) return;
  timerHandle = setTimeout(() => {
    void tick().finally(() => scheduleNext());
  }, PURGE_INTERVAL_MS);
  timerHandle.unref();
}

export function startDemoPurgeScheduler(): void {
  if (timerHandle) return;
  stopped = false;
  timerHandle = setTimeout(() => {
    void tick().finally(() => scheduleNext());
  }, 60_000);
  timerHandle.unref();
  logger.info(
    { retentionDays: RETENTION_DAYS, intervalHours: 24 },
    "Demo events purge scheduler started",
  );
}

export function stopDemoPurgeScheduler(): void {
  stopped = true;
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
}
