import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { DigestConfig } from "./digestConfig";
import { getDigestConfig } from "./digestConfig";
import { logger } from "./logger";
import { sendWeeklyDigest } from "./weeklyDigest";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SCHEDULE_ID = 1;
/** Wait this long after a failed send before retrying within the same week. */
export const FAILURE_RETRY_MS = HOUR_MS;

/**
 * Compute the next run timestamp given the current digest configuration.
 *
 * - If both `sendDay` and `sendHour` are configured: next future UTC
 *   weekday-and-hour slot (top-of-the-hour).
 * - If only `sendDay` is set: next future occurrence of that UTC weekday at
 *   00:00 UTC.
 * - If only `sendHour` is set: next future occurrence of that UTC hour.
 * - Otherwise: a plain weekly cadence (`from + 7 days`).
 */
export function computeNextRunAt(
  config: Pick<DigestConfig, "sendDay" | "sendHour">,
  from: Date,
): Date {
  const { sendDay, sendHour } = config;
  if (sendDay !== null) {
    const hour = sendHour ?? 0;
    const next = new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate(),
        hour,
        0,
        0,
        0,
      ),
    );
    let dayDelta = (sendDay - next.getUTCDay() + 7) % 7;
    if (dayDelta === 0 && next.getTime() <= from.getTime()) dayDelta = 7;
    next.setUTCDate(next.getUTCDate() + dayDelta);
    return next;
  }
  if (sendHour !== null) {
    const next = new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate(),
        sendHour,
        0,
        0,
        0,
      ),
    );
    if (next.getTime() <= from.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }
  return new Date(from.getTime() + WEEK_MS);
}

/**
 * Create the schedule table if it does not yet exist. Lets the scheduler
 * bootstrap on a fresh database without requiring a separate migration step
 * to land first.
 */
export async function ensureDigestScheduleTable(): Promise<void> {
  await db.execute(sql`
    create table if not exists digest_schedule (
      id integer primary key,
      next_run_at timestamptz not null,
      last_run_at timestamptz,
      last_status varchar(16),
      last_error text,
      updated_at timestamptz not null default now()
    )
  `);
}

export interface DigestScheduleRow {
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  updatedAt: Date;
}

function rowToSchedule(row: {
  next_run_at: string | Date;
  last_run_at: string | Date | null;
  last_status: string | null;
  last_error: string | null;
  updated_at: string | Date;
}): DigestScheduleRow {
  return {
    nextRunAt: row.next_run_at instanceof Date ? row.next_run_at : new Date(row.next_run_at),
    lastRunAt:
      row.last_run_at == null
        ? null
        : row.last_run_at instanceof Date
          ? row.last_run_at
          : new Date(row.last_run_at),
    lastStatus: row.last_status,
    lastError: row.last_error,
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

export async function getDigestSchedule(): Promise<DigestScheduleRow | null> {
  const res = await db.execute<{
    next_run_at: string | Date;
    last_run_at: string | Date | null;
    last_status: string | null;
    last_error: string | null;
    updated_at: string | Date;
  }>(sql`
    select next_run_at, last_run_at, last_status, last_error, updated_at
    from digest_schedule where id = ${SCHEDULE_ID}
  `);
  const rows =
    res.rows ??
    (res as unknown as Array<{
      next_run_at: string | Date;
      last_run_at: string | Date | null;
      last_status: string | null;
      last_error: string | null;
      updated_at: string | Date;
    }>);
  const first = rows[0];
  return first ? rowToSchedule(first) : null;
}

/**
 * Insert the schedule row if missing. Returns the current schedule row.
 */
export async function initDigestSchedule(
  config: Pick<DigestConfig, "sendDay" | "sendHour">,
  now: Date = new Date(),
): Promise<DigestScheduleRow> {
  const next = computeNextRunAt(config, now);
  await db.execute(sql`
    insert into digest_schedule (id, next_run_at)
    values (${SCHEDULE_ID}, ${next.toISOString()})
    on conflict (id) do nothing
  `);
  const current = await getDigestSchedule();
  if (!current) {
    throw new Error("Failed to initialize digest_schedule row.");
  }
  return current;
}

/**
 * Atomically claim the current scheduled slot. Advances `next_run_at` to the
 * next slot in the same statement so concurrent workers cannot double-fire.
 * Returns the new `next_run_at` (the next slot just scheduled) if the slot
 * was claimed, or `null` if the current slot was not yet due.
 */
export async function claimDigestSlot(
  config: Pick<DigestConfig, "sendDay" | "sendHour">,
  now: Date = new Date(),
): Promise<Date | null> {
  const nextAfter = computeNextRunAt(config, now);
  const res = await db.execute<{ claimed_at: string | Date }>(sql`
    update digest_schedule
       set next_run_at = ${nextAfter.toISOString()},
           updated_at = now()
     where id = ${SCHEDULE_ID}
       and next_run_at <= ${now.toISOString()}
    returning next_run_at as claimed_at
  `);
  const rows =
    res.rows ?? (res as unknown as Array<{ claimed_at: string | Date }>);
  const first = rows[0];
  if (!first) return null;
  return first.claimed_at instanceof Date
    ? first.claimed_at
    : new Date(first.claimed_at);
}

/**
 * Pure helper: pick the anchor for `computeNextRunAt` when reconciling the
 * stored schedule against current config. Always returns a moment >= `now`,
 * so the recomputed slot is guaranteed to be strictly in the future and
 * cannot retroactively trigger a past send when an admin moves the slot
 * earlier in the week before the first run has happened.
 */
export function pickRescheduleAnchor(
  schedule: Pick<DigestScheduleRow, "lastRunAt" | "updatedAt">,
  now: Date,
): Date {
  const base = schedule.lastRunAt ?? schedule.updatedAt;
  return base.getTime() > now.getTime() ? base : now;
}

/**
 * Force-update the next planned run time. Used to reflect configuration
 * changes (sendDay/sendHour) on the schedule between runs.
 */
export async function reschedule(nextRunAt: Date): Promise<void> {
  await db.execute(sql`
    update digest_schedule
       set next_run_at = ${nextRunAt.toISOString()},
           updated_at = now()
     where id = ${SCHEDULE_ID}
  `);
}

export async function recordDigestRunResult(
  status: "sent" | "skipped" | "failed",
  errorMessage: string | null,
  ranAt: Date = new Date(),
): Promise<void> {
  await db.execute(sql`
    update digest_schedule
       set last_run_at = ${ranAt.toISOString()},
           last_status = ${status},
           last_error = ${errorMessage},
           updated_at = now()
     where id = ${SCHEDULE_ID}
  `);
}

let timerHandle: NodeJS.Timeout | null = null;
let stopped = false;
const MAX_DELAY_MS = HOUR_MS; // re-check at least hourly to pick up config edits

interface SchedulerDeps {
  configProvider?: () => Promise<DigestConfig>;
  send?: typeof sendWeeklyDigest;
  now?: () => Date;
}

async function runOnce(deps: SchedulerDeps): Promise<void> {
  const cfgFn = deps.configProvider ?? getDigestConfig;
  const sendFn = deps.send ?? sendWeeklyDigest;
  const nowFn = deps.now ?? (() => new Date());
  const config = await cfgFn();
  const now = nowFn();

  if (config.paused) {
    // Don't claim while paused; just leave next_run_at and try again later.
    return;
  }

  const claimed = await claimDigestSlot(config, now);
  if (!claimed) return;

  let status: "sent" | "skipped" | "failed" = "skipped";
  let errorMessage: string | null = null;
  try {
    // We already gated on next_run_at via the DB; bypass the in-process
    // day/hour/cooldown gates so a single overdue slot fires reliably.
    const result = await sendFn({ force: true });
    status = result.status;
    errorMessage =
      result.status === "failed" ? (result.reason ?? "unknown error") : null;
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Weekly digest scheduler run threw");
  }
  await recordDigestRunResult(status, errorMessage, now).catch((err) => {
    logger.error({ err }, "Failed to persist digest scheduler result");
  });
  // On a transient failure, reschedule a near-term retry so we don't have
  // to wait a full week for the next configured slot to come around.
  if (status === "failed") {
    await reschedule(new Date(now.getTime() + FAILURE_RETRY_MS)).catch(
      (err) => {
        logger.error({ err }, "Failed to schedule digest retry");
      },
    );
  }
}

async function scheduleNextWakeup(deps: SchedulerDeps): Promise<void> {
  if (stopped) return;
  const cfgFn = deps.configProvider ?? getDigestConfig;
  const nowFn = deps.now ?? (() => new Date());
  let delay = MAX_DELAY_MS;
  try {
    const config = await cfgFn();
    const schedule = await initDigestSchedule(config, nowFn());
    // Recompute the desired next slot from current config so admin edits to
    // sendDay/sendHour take effect on the next wakeup, even if no run has
    // happened yet. We anchor from the later of (a) the last run (or
    // schedule creation if none) and (b) "now", which guarantees the
    // computed slot is strictly in the future and cannot retroactively
    // trigger a past send when the admin moves the slot earlier in the
    // week. We skip this reconcile when the last status was "failed" so
    // the near-term retry slot scheduled by `runOnce` isn't clobbered.
    if (schedule.lastStatus !== "failed") {
      const now = nowFn();
      const anchor = pickRescheduleAnchor(schedule, now);
      const desired = computeNextRunAt(config, anchor);
      if (desired.getTime() !== schedule.nextRunAt.getTime()) {
        await reschedule(desired);
        schedule.nextRunAt = desired;
      }
    }
    const ms = schedule.nextRunAt.getTime() - nowFn().getTime();
    delay = Math.max(0, Math.min(MAX_DELAY_MS, ms));
  } catch (err) {
    logger.error({ err }, "Failed to read digest schedule; retrying in 1h");
  }
  timerHandle = setTimeout(() => {
    runOnce(deps)
      .catch((err) => {
        logger.error({ err }, "Weekly digest scheduler tick crashed");
      })
      .finally(() => {
        void scheduleNextWakeup(deps);
      });
  }, delay);
  timerHandle.unref();
}

/**
 * Start the durable weekly digest scheduler. Persists scheduler state in the
 * `digest_schedule` table so the cadence survives restarts and is observable
 * from SQL. The first wakeup is deferred slightly so server startup is not
 * blocked on database round-trips.
 */
export async function startDurableDigestScheduler(
  deps: SchedulerDeps = {},
): Promise<void> {
  if (timerHandle) return;
  if (!process.env["AGENTMAIL_API_KEY"]) {
    logger.warn(
      "Weekly digest scheduler not started: AGENTMAIL_API_KEY is not set.",
    );
    return;
  }
  stopped = false;
  try {
    await ensureDigestScheduleTable();
    const cfgFn = deps.configProvider ?? getDigestConfig;
    const config = await cfgFn();
    await initDigestSchedule(config, (deps.now ?? (() => new Date()))());
  } catch (err) {
    logger.error(
      { err },
      "Failed to bootstrap digest scheduler; will retry on first wakeup",
    );
  }
  // Defer first wakeup briefly so we don't block server startup.
  timerHandle = setTimeout(() => {
    void scheduleNextWakeup(deps);
  }, 60 * 1000);
  timerHandle.unref();
  logger.info("Durable weekly digest scheduler started.");
}

export function stopDurableDigestScheduler(): void {
  stopped = true;
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
}
