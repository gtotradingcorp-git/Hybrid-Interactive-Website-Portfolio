import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";

// Same convention as the other tests: provide a parseable but unreachable
// DATABASE_URL so importing @workspace/db doesn't throw, and disable the
// durable limiter's background cleanup interval so it doesn't try to query
// the (unreachable) DB on its own schedule during the test run.
process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";
process.env["RATE_LIMIT_DISABLE_CLEANUP"] = "1";

const {
  createRateLimiter,
  createDurableRateLimiter,
  createRouteRateLimiter,
  getClientIp,
  _stopRateLimitCleanup,
} = await import("../src/lib/rateLimit.ts");
const dbMod = await import("@workspace/db");

type Execute = typeof dbMod.db.execute;
const originalExecute: Execute = dbMod.db.execute.bind(dbMod.db) as Execute;

interface ExecCall {
  text: string;
  params: unknown[];
}

/**
 * Stub `db.execute` so durable-limiter tests can run without a live
 * Postgres. The handler receives every parameterized SQL call (the same
 * shape used by drizzle's `sql\`...\`` template) and returns the rows the
 * caller would normally read out of the database. This mirrors the pattern
 * used in digestScheduler.test.ts.
 */
function stubExecute(
  handler: (call: ExecCall) => unknown[],
): { calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  (dbMod.db as { execute: Execute }).execute = (async (q: unknown) => {
    const queryObj = q as { queryChunks?: unknown[] };
    const chunks = queryObj.queryChunks ?? [];
    // Drizzle's sql`` template doesn't pre-split params from text. The
    // queryChunks array interleaves StringChunk objects (literal SQL) with
    // raw parameter values (strings, numbers, etc.). Walk the chunks once
    // to reconstruct both: a `?`-marked SQL string for regex assertions and
    // the ordered list of bound parameters.
    const params: unknown[] = [];
    const text = chunks
      .map((c) => {
        if (c && typeof c === "object" && "value" in c) {
          const v = (c as { value: unknown[] }).value;
          return Array.isArray(v) ? v.join("") : String(v);
        }
        params.push(c);
        return "?";
      })
      .join("");
    const call: ExecCall = { text, params };
    calls.push(call);
    const rows = handler(call);
    return { rows } as unknown as ReturnType<Execute>;
  }) as unknown as Execute;
  return { calls };
}

function restoreDb(): void {
  (dbMod.db as { execute: Execute }).execute = originalExecute;
}

test("allows up to max within the window then blocks with the configured reason", () => {
  const limiter = createRateLimiter([
    { windowMs: 60_000, max: 3, reason: "slow down" },
  ]);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(limiter.check("a").ok, true, `request ${i + 1}`);
  }
  const blocked = limiter.check("a");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "slow down");
});

test("tracks separate buckets per key", () => {
  const limiter = createRateLimiter([
    { windowMs: 60_000, max: 1, reason: "no" },
  ]);
  assert.equal(limiter.check("a").ok, true);
  assert.equal(limiter.check("b").ok, true);
  assert.equal(limiter.check("a").ok, false);
  assert.equal(limiter.check("b").ok, false);
});

test("multiple windows: shorter window trips first; daily reason kicks in independently", () => {
  const limiter = createRateLimiter([
    { windowMs: 60_000, max: 2, reason: "minute cap" },
    { windowMs: 24 * 60 * 60 * 1000, max: 3, reason: "daily cap" },
  ]);
  assert.equal(limiter.check("k").ok, true);
  assert.equal(limiter.check("k").ok, true);
  // 3rd hits the minute cap first.
  const r3 = limiter.check("k");
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, "minute cap");
});

test("reset() clears all buckets across all windows", () => {
  const limiter = createRateLimiter([
    { windowMs: 60_000, max: 1, reason: "no" },
  ]);
  assert.equal(limiter.check("a").ok, true);
  assert.equal(limiter.check("a").ok, false);
  limiter.reset();
  assert.equal(limiter.check("a").ok, true);
});

test("window resets after windowMs elapses (using a tiny window)", async () => {
  const limiter = createRateLimiter([
    { windowMs: 25, max: 1, reason: "no" },
  ]);
  assert.equal(limiter.check("a").ok, true);
  assert.equal(limiter.check("a").ok, false);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(limiter.check("a").ok, true);
});

test("requires at least one window", () => {
  assert.throws(() => createRateLimiter([]), /at least one window/);
});

test("getClientIp uses req.ip (Express-validated) and IGNORES raw x-forwarded-for", () => {
  // Spoofed XFF must NOT influence the key when trust proxy isn't enabled.
  // Express only populates req.ip from XFF when the app has opted in via
  // `app.set('trust proxy', ...)`; otherwise req.ip is the socket peer.
  const spoofed = {
    headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    ip: "10.0.0.1",
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as Request;
  assert.equal(getClientIp(spoofed), "10.0.0.1");

  const noIp = {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as Request;
  assert.equal(getClientIp(noIp), "127.0.0.1");

  const nothing = { headers: {} } as unknown as Request;
  assert.equal(getClientIp(nothing), "unknown");
});

// ─── Durable Postgres-backed limiter ─────────────────────────────────────────
// The durable limiter speaks to Postgres via a single upsert per window. We
// stub `db.execute` to model bucket state in-memory, then assert the limiter
// returns the right allow/block decision for a given returned `count`.

test("createDurableRateLimiter requires at least one window", () => {
  assert.throws(
    () => createDurableRateLimiter("r", []),
    /at least one window/,
  );
});

test("durable limiter: allows up to max then blocks with configured reason", async (t) => {
  // Simulated post-increment counts the upsert returns for each call.
  // Mirrors a fresh bucket that increments by 1 on every check.
  let count = 0;
  stubExecute((call) => {
    if (/insert into rate_limit_buckets/.test(call.text)) {
      count += 1;
      return [{ count }];
    }
    return [];
  });
  t.after(() => restoreDb());

  const limiter = createDurableRateLimiter("chat", [
    { windowMs: 60_000, max: 3, reason: "slow down" },
  ]);

  for (let i = 0; i < 3; i += 1) {
    const ok = await limiter.check("ip-1");
    assert.equal(ok.ok, true, `request ${i + 1} should be allowed`);
  }
  const blocked = await limiter.check("ip-1");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "slow down");
});

test("durable limiter: forwards route, key, and windowMs into each upsert", async (t) => {
  const seen: Array<{ params: unknown[] }> = [];
  stubExecute((call) => {
    if (/insert into rate_limit_buckets/.test(call.text)) {
      seen.push({ params: call.params });
      return [{ count: 1 }];
    }
    return [];
  });
  t.after(() => restoreDb());

  const limiter = createDurableRateLimiter("contact", [
    { windowMs: 600_000, max: 5, reason: "too many" },
  ]);
  await limiter.check("198.51.100.7");

  assert.equal(seen.length, 1);
  // Drizzle parameter order matches the order placeholders appear in the
  // SQL template. The upsert references route, key, windowMs (twice for
  // make_interval), then again in the on-conflict clause.
  const params = seen[0]!.params;
  assert.ok(params.includes("contact"), "route should appear in params");
  assert.ok(params.includes("198.51.100.7"), "key should appear in params");
  assert.ok(params.includes(600_000), "windowMs should appear in params");
});

test("durable limiter: multi-window — first window to overflow wins (minute cap before daily cap)", async (t) => {
  // Two windows. The minute window saturates after 2 hits; the daily
  // window allows 3. On the 3rd call the minute cap should trip first
  // even though the daily count is still under its max.
  let minute = 0;
  let daily = 0;
  stubExecute((call) => {
    if (!/insert into rate_limit_buckets/.test(call.text)) return [];
    // The windowMs param uniquely identifies which window the call is for.
    if (call.params.includes(60_000)) {
      minute += 1;
      return [{ count: minute }];
    }
    daily += 1;
    return [{ count: daily }];
  });
  t.after(() => restoreDb());

  const limiter = createDurableRateLimiter("chat", [
    { windowMs: 60_000, max: 2, reason: "minute cap" },
    { windowMs: 24 * 60 * 60 * 1000, max: 3, reason: "daily cap" },
  ]);
  assert.equal((await limiter.check("k")).ok, true);
  assert.equal((await limiter.check("k")).ok, true);
  const r3 = await limiter.check("k");
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, "minute cap");
});

test("durable limiter: bucket expiry — reset count of 1 returned by upsert is allowed", async (t) => {
  // Simulate a bucket that hit its cap, then `expires_at < now()` triggered
  // the upsert's reset branch. The post-increment count returned is 1, so
  // the next request after expiry must be allowed again.
  const sequence = [1, 2, 3, 4, 1]; // last value = post-expiry reset
  let i = 0;
  stubExecute((call) => {
    if (/insert into rate_limit_buckets/.test(call.text)) {
      const v = sequence[i] ?? 1;
      i += 1;
      return [{ count: v }];
    }
    return [];
  });
  t.after(() => restoreDb());

  const limiter = createDurableRateLimiter("chat", [
    { windowMs: 25, max: 3, reason: "no" },
  ]);

  assert.equal((await limiter.check("a")).ok, true); // 1
  assert.equal((await limiter.check("a")).ok, true); // 2
  assert.equal((await limiter.check("a")).ok, true); // 3
  assert.equal((await limiter.check("a")).ok, false); // 4 — over cap
  // After window expiry the upsert resets the row and returns count = 1.
  assert.equal((await limiter.check("a")).ok, true);
});

test("durable limiter: reset() issues a delete scoped to the route", async (t) => {
  const calls: ExecCall[] = [];
  stubExecute((call) => {
    calls.push(call);
    if (/insert into rate_limit_buckets/.test(call.text)) {
      return [{ count: 1 }];
    }
    return [];
  });
  t.after(() => restoreDb());

  const limiter = createDurableRateLimiter("chat", [
    { windowMs: 60_000, max: 1, reason: "no" },
  ]);
  await limiter.reset();

  const del = calls.find((c) => /delete from rate_limit_buckets/.test(c.text));
  assert.ok(del, "expected a DELETE statement");
  assert.ok(/where route = /.test(del!.text), "DELETE should be scoped by route");
  assert.ok(del!.params.includes("chat"), "DELETE should bind the route name");
});

test("durable limiter: upsert SQL precomputes expires_at and resets on expiry", async (t) => {
  // Capture the SQL once so we can assert the structural pieces that make
  // bucket expiry work durably: a precomputed `expires_at`, an `on conflict`
  // upsert that branches on `expires_at < now()`, and `returning count` so
  // the limiter can read the post-increment value back.
  const calls: ExecCall[] = [];
  stubExecute((call) => {
    calls.push(call);
    return [{ count: 1 }];
  });
  t.after(() => restoreDb());

  const limiter = createDurableRateLimiter("chat", [
    { windowMs: 60_000, max: 5, reason: "no" },
  ]);
  await limiter.check("k");

  const upsert = calls.find((c) => /insert into rate_limit_buckets/.test(c.text));
  assert.ok(upsert, "expected an INSERT statement");
  const sqlText = upsert!.text;
  assert.match(sqlText, /on conflict \(route, key, window_ms\) do update/);
  assert.match(sqlText, /expires_at < now\(\)/);
  assert.match(sqlText, /make_interval\(secs => /);
  assert.match(sqlText, /returning count/);
});

test("createRouteRateLimiter: respects RATE_LIMIT_BACKEND=memory", async (t) => {
  const original = process.env["RATE_LIMIT_BACKEND"];
  process.env["RATE_LIMIT_BACKEND"] = "memory";
  t.after(() => {
    if (original === undefined) {
      delete process.env["RATE_LIMIT_BACKEND"];
    } else {
      process.env["RATE_LIMIT_BACKEND"] = original;
    }
  });

  // If this picked the durable backend, the unreachable DATABASE_URL would
  // make every check throw. The fact that we get clean allow/block results
  // proves the in-memory variant was selected.
  const limiter = createRouteRateLimiter("test-route", [
    { windowMs: 60_000, max: 1, reason: "no" },
  ]);
  assert.equal((await limiter.check("k")).ok, true);
  assert.equal((await limiter.check("k")).ok, false);
});

test("teardown: stop rate-limit cleanup interval", () => {
  // Defensive — most tests disable cleanup via the env var, but if any
  // future test forgets to, this keeps node --test from hanging.
  _stopRateLimitCleanup();
});
