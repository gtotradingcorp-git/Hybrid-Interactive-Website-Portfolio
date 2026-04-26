import { test } from "node:test";
import assert from "node:assert/strict";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";

const {
  computeNextRunAt,
  claimDigestSlot,
  recordDigestRunResult,
  reschedule,
  pickRescheduleAnchor,
} = await import("../src/lib/digestScheduler.ts");
const dbMod = await import("@workspace/db");

type Execute = typeof dbMod.db.execute;
const originalExecute: Execute = dbMod.db.execute.bind(dbMod.db) as Execute;

interface ExecCall {
  text: string;
  params: unknown[];
}

function stubExecute(
  handler: (call: ExecCall) => unknown[],
): { calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  (dbMod.db as { execute: Execute }).execute = (async (q: unknown) => {
    const queryObj = q as { queryChunks?: unknown[]; params?: unknown[] };
    const chunks = queryObj.queryChunks ?? [];
    const text = chunks
      .map((c) => {
        if (c && typeof c === "object" && "value" in c) {
          const v = (c as { value: unknown[] }).value;
          return Array.isArray(v) ? v.join("") : String(v);
        }
        return "?";
      })
      .join("");
    const call: ExecCall = { text, params: queryObj.params ?? [] };
    calls.push(call);
    const rows = handler(call);
    return { rows } as unknown as ReturnType<Execute>;
  }) as unknown as Execute;
  return { calls };
}

function restoreDb(): void {
  (dbMod.db as { execute: Execute }).execute = originalExecute;
}

test("computeNextRunAt: weekly cadence when no day/hour configured", () => {
  const from = new Date("2026-04-15T09:00:00Z");
  const next = computeNextRunAt({ sendDay: null, sendHour: null }, from);
  assert.equal(next.toISOString(), "2026-04-22T09:00:00.000Z");
});

test("computeNextRunAt: next occurrence of configured weekday/hour", () => {
  // Wed 2026-04-15 10:00 UTC; configured for Mon 14:00 UTC -> next is
  // Mon 2026-04-20 14:00 UTC.
  const from = new Date("2026-04-15T10:00:00Z");
  const next = computeNextRunAt({ sendDay: 1, sendHour: 14 }, from);
  assert.equal(next.toISOString(), "2026-04-20T14:00:00.000Z");
});

test("computeNextRunAt: same-day slot already passed advances by a week", () => {
  // Wed 2026-04-15 15:00 UTC; configured for Wed (3) 14:00 UTC -> next is
  // Wed 2026-04-22 14:00 UTC.
  const from = new Date("2026-04-15T15:00:00Z");
  const next = computeNextRunAt({ sendDay: 3, sendHour: 14 }, from);
  assert.equal(next.toISOString(), "2026-04-22T14:00:00.000Z");
});

test("computeNextRunAt: same-day slot still upcoming fires today", () => {
  const from = new Date("2026-04-15T09:30:00Z");
  const next = computeNextRunAt({ sendDay: 3, sendHour: 14 }, from);
  assert.equal(next.toISOString(), "2026-04-15T14:00:00.000Z");
});

test("computeNextRunAt: sendDay-only schedules next occurrence at 00:00 UTC", () => {
  // Wed 2026-04-15 10:00 UTC; configured for Mon (1) only -> next Monday
  // 2026-04-20 at 00:00 UTC.
  const from = new Date("2026-04-15T10:00:00Z");
  const next = computeNextRunAt({ sendDay: 1, sendHour: null }, from);
  assert.equal(next.toISOString(), "2026-04-20T00:00:00.000Z");
});

test("computeNextRunAt: sendDay-only on the same weekday after midnight rolls a week", () => {
  // Mon 2026-04-13 10:00 UTC; configured for Mon (1) only. The 00:00 slot
  // already passed today, so next is Mon 2026-04-20 00:00 UTC.
  const from = new Date("2026-04-13T10:00:00Z");
  const next = computeNextRunAt({ sendDay: 1, sendHour: null }, from);
  assert.equal(next.toISOString(), "2026-04-20T00:00:00.000Z");
});

test("computeNextRunAt: hour-only schedules at next hour boundary", () => {
  const from = new Date("2026-04-15T15:30:00Z");
  const next = computeNextRunAt({ sendDay: null, sendHour: 9 }, from);
  assert.equal(next.toISOString(), "2026-04-16T09:00:00.000Z");
});

test("claimDigestSlot returns null when no row is due", async () => {
  const { calls } = stubExecute(() => []);
  try {
    const claimed = await claimDigestSlot(
      { sendDay: null, sendHour: null },
      new Date("2026-04-15T09:00:00Z"),
    );
    assert.equal(claimed, null);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.text, /update digest_schedule/);
    assert.match(calls[0]!.text, /next_run_at <=/);
  } finally {
    restoreDb();
  }
});

test("claimDigestSlot returns the previous next_run_at when claimed", async () => {
  const previous = "2026-04-15T09:00:00.000Z";
  stubExecute(() => [{ claimed_at: previous }]);
  try {
    const claimed = await claimDigestSlot(
      { sendDay: null, sendHour: null },
      new Date("2026-04-15T09:30:00Z"),
    );
    assert.ok(claimed);
    assert.equal(claimed!.toISOString(), previous);
  } finally {
    restoreDb();
  }
});

test("pickRescheduleAnchor never returns a moment in the past", () => {
  // Config edit before any run: schedule was created Sunday, admin moves
  // sendDay to Monday at 09:00 mid-week. Anchor must clamp to "now" so the
  // recomputed slot lands NEXT Monday, not past Monday.
  const now = new Date("2026-04-15T10:00:00Z"); // Wed
  const schedule = {
    lastRunAt: null,
    updatedAt: new Date("2026-04-12T00:00:00Z"), // Sun
  };
  const anchor = pickRescheduleAnchor(schedule, now);
  assert.equal(anchor.toISOString(), now.toISOString());

  // After the recompute, the next slot is the upcoming Monday at 09:00 UTC,
  // not the past Monday.
  const next = computeNextRunAt({ sendDay: 1, sendHour: 9 }, anchor);
  assert.equal(next.toISOString(), "2026-04-20T09:00:00.000Z");
  assert.ok(next.getTime() > now.getTime(), "must be strictly in the future");
});

test("pickRescheduleAnchor uses lastRunAt when it is in the future relative to now (clock skew)", () => {
  const now = new Date("2026-04-15T10:00:00Z");
  const schedule = {
    lastRunAt: new Date("2026-04-15T11:00:00Z"),
    updatedAt: new Date("2026-04-12T00:00:00Z"),
  };
  const anchor = pickRescheduleAnchor(schedule, now);
  assert.equal(anchor.toISOString(), schedule.lastRunAt.toISOString());
});

test("reschedule updates next_run_at via SQL", async () => {
  const { calls } = stubExecute(() => []);
  try {
    await reschedule(new Date("2026-05-01T09:00:00Z"));
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.text, /update digest_schedule/);
    assert.match(calls[0]!.text, /next_run_at/);
  } finally {
    restoreDb();
  }
});

test("recordDigestRunResult issues an update with status and error", async () => {
  const { calls } = stubExecute(() => []);
  try {
    await recordDigestRunResult(
      "failed",
      "boom",
      new Date("2026-04-15T09:00:00Z"),
    );
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.text, /update digest_schedule/);
    assert.match(calls[0]!.text, /last_status/);
    assert.match(calls[0]!.text, /last_error/);
  } finally {
    restoreDb();
  }
});
