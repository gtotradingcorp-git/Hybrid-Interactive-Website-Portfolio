import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

export interface RateLimitWindow {
  windowMs: number;
  max: number;
  reason: string;
}

export interface RateLimitResult {
  ok: boolean;
  reason?: string;
}

/**
 * Synchronous, in-process rate limiter. Counters live only in memory, so they
 * reset on restart and are not shared across replicas. Kept for unit tests
 * and as a fallback when the durable backend is explicitly disabled.
 */
export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(): void;
}

/**
 * Async-shaped rate limiter that consumers (route handlers) talk to. Both the
 * durable Postgres-backed implementation and the in-memory variant are
 * exposed through this interface so call sites can `await limiter.check(...)`
 * without caring which backend is wired up underneath.
 */
export interface AsyncRateLimiter {
  check(key: string): Promise<RateLimitResult>;
  reset(): Promise<void>;
}

interface Bucket {
  start: number;
  count: number;
}

export function createRateLimiter(windows: RateLimitWindow[]): RateLimiter {
  if (windows.length === 0) {
    throw new Error("createRateLimiter requires at least one window");
  }
  const buckets: Array<Map<string, Bucket>> = windows.map(() => new Map());

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      for (let i = 0; i < windows.length; i += 1) {
        const w = windows[i]!;
        const map = buckets[i]!;
        let b = map.get(key);
        if (!b || now - b.start > w.windowMs) {
          b = { start: now, count: 0 };
          map.set(key, b);
        }
        b.count += 1;
      }
      for (let i = 0; i < windows.length; i += 1) {
        const w = windows[i]!;
        const b = buckets[i]!.get(key)!;
        if (b.count > w.max) {
          return { ok: false, reason: w.reason };
        }
      }
      return { ok: true };
    },
    reset(): void {
      for (const m of buckets) m.clear();
    },
  };
}

/** Adapter that exposes a sync RateLimiter through the AsyncRateLimiter shape. */
function toAsyncLimiter(inner: RateLimiter): AsyncRateLimiter {
  return {
    check: async (key: string) => inner.check(key),
    reset: async () => inner.reset(),
  };
}

// One process-wide background cleanup interval shared by every durable
// limiter created in this process. We start it lazily the first time a
// durable limiter is constructed so importing this module from a unit test
// (which never creates a durable limiter) does not leave a dangling timer.
let cleanupHandle: NodeJS.Timeout | null = null;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function ensureCleanupRunning(): void {
  if (cleanupHandle != null) return;
  if (process.env["RATE_LIMIT_DISABLE_CLEANUP"] === "1") return;
  cleanupHandle = setInterval(() => {
    db.execute(sql`delete from rate_limit_buckets where expires_at < now()`)
      .catch((err) => {
        logger.warn({ err }, "rate-limit bucket cleanup failed");
      });
  }, CLEANUP_INTERVAL_MS);
  // Don't keep the event loop alive just for cleanup.
  cleanupHandle.unref?.();
}

/** Test helper: stop the background cleanup interval if one is running. */
export function _stopRateLimitCleanup(): void {
  if (cleanupHandle != null) {
    clearInterval(cleanupHandle);
    cleanupHandle = null;
  }
}

/**
 * Increment a single durable bucket and return its post-increment count.
 *
 * The upsert atomically handles two cases in one round-trip:
 *   1. Fresh bucket: insert a new row with count = 1.
 *   2. Existing bucket: if `expires_at` has already passed, reset the row to
 *      a brand-new window (count = 1, fresh window_start/expires_at).
 *      Otherwise just increment count.
 *
 * Because `expires_at` is precomputed at write time, the expiry check is a
 * cheap timestamp comparison rather than interval arithmetic.
 */
async function incrementDurableBucket(
  route: string,
  key: string,
  windowMs: number,
): Promise<number> {
  // Postgres `interval` literals don't accept a parameter directly, so we
  // build the interval from a numeric milliseconds value via `make_interval`.
  // make_interval(secs => ms / 1000.0) keeps sub-second precision.
  const result = await db.execute<{ count: number }>(sql`
    insert into rate_limit_buckets (route, key, window_ms, window_start, expires_at, count)
    values (
      ${route},
      ${key},
      ${windowMs},
      now(),
      now() + make_interval(secs => ${windowMs} / 1000.0),
      1
    )
    on conflict (route, key, window_ms) do update set
      count = case
        when rate_limit_buckets.expires_at < now() then 1
        else rate_limit_buckets.count + 1
      end,
      window_start = case
        when rate_limit_buckets.expires_at < now() then now()
        else rate_limit_buckets.window_start
      end,
      expires_at = case
        when rate_limit_buckets.expires_at < now()
          then now() + make_interval(secs => ${windowMs} / 1000.0)
        else rate_limit_buckets.expires_at
      end
    returning count
  `);
  const rows =
    result.rows ?? (result as unknown as Array<{ count: number }>);
  const row = rows[0];
  return row ? Number(row.count) : 0;
}

/**
 * Durable, multi-instance-safe rate limiter backed by the
 * `rate_limit_buckets` Postgres table. The interface and semantics match
 * `createRateLimiter` (fixed-window per (route, key, window) bucket; first
 * window to overflow wins), but counts are shared across replicas and
 * survive restarts.
 */
export function createDurableRateLimiter(
  route: string,
  windows: RateLimitWindow[],
): AsyncRateLimiter {
  if (windows.length === 0) {
    throw new Error("createDurableRateLimiter requires at least one window");
  }
  ensureCleanupRunning();

  return {
    async check(key: string): Promise<RateLimitResult> {
      // Increment every window's bucket in parallel so a request only pays
      // for one DB round-trip's worth of latency regardless of how many
      // windows are configured. Each upsert touches a different primary
      // key, so they don't contend with each other.
      const counts = await Promise.all(
        windows.map((w) => incrementDurableBucket(route, key, w.windowMs)),
      );
      for (let i = 0; i < windows.length; i += 1) {
        const w = windows[i]!;
        if ((counts[i] ?? 0) > w.max) {
          return { ok: false, reason: w.reason };
        }
      }
      return { ok: true };
    },
    async reset(): Promise<void> {
      await db.execute(
        sql`delete from rate_limit_buckets where route = ${route}`,
      );
    },
  };
}

/**
 * Factory used by route handlers. Picks the durable Postgres-backed
 * implementation by default, but falls back to the in-memory variant when
 * `RATE_LIMIT_BACKEND=memory` is set — which is what test suites that don't
 * have a real database opt into.
 */
export function createRouteRateLimiter(
  route: string,
  windows: RateLimitWindow[],
): AsyncRateLimiter {
  if (process.env["RATE_LIMIT_BACKEND"] === "memory") {
    return toAsyncLimiter(createRateLimiter(windows));
  }
  return createDurableRateLimiter(route, windows);
}

// Derive a stable per-client key for rate limiting. We deliberately do NOT
// read `x-forwarded-for` ourselves: that header is trivially spoofable by
// any HTTP client, so trusting it directly would let attackers rotate fake
// IPs and bypass the limiter. Instead we rely on `req.ip`, which Express
// only fills from `x-forwarded-for` when the application has explicitly
// opted in via `app.set('trust proxy', ...)` with a trust chain that matches
// the deployment. When trust proxy is not configured (the default and the
// current setup here) `req.ip` is the direct socket peer, which is what we
// want for abuse defense.
export function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}
