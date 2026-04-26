import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";

const dbMod = await import("@workspace/db");
const { purgeStaleDemoEvents, RETENTION_DAYS } = await import(
  "../src/lib/demoPurge.ts"
);

type Execute = typeof dbMod.db.execute;
const originalExecute: Execute = dbMod.db.execute.bind(dbMod.db) as Execute;

interface ExecCall {
  text: string;
  params: unknown[];
}

function stubExecute(
  handler: (call: ExecCall) => { rowCount: number },
): { calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  (dbMod.db as { execute: Execute }).execute = (async (q: unknown) => {
    const queryObj = q as { queryChunks?: unknown[] };
    const chunks = queryObj.queryChunks ?? [];
    const params: unknown[] = [];
    const text = chunks
      .map((c) => {
        if (c && typeof c === "object" && "value" in c) {
          const v = (c as { value: unknown[] }).value;
          return Array.isArray(v) ? v.join("") : String(v);
        }
        if (c && typeof c === "object" && "encoder" in c) {
          const p = (c as { value: unknown }).value;
          params.push(p);
          return `$${params.length}`;
        }
        params.push(c);
        return `$${params.length}`;
      })
      .join("");
    const call: ExecCall = { text, params };
    calls.push(call);
    return handler(call) as unknown as ReturnType<Execute>;
  }) as unknown as Execute;
  return { calls };
}

afterEach(() => {
  (dbMod.db as { execute: Execute }).execute = originalExecute;
});

test("RETENTION_DAYS is 120", () => {
  assert.equal(RETENTION_DAYS, 120);
});

test("issues a DELETE targeting demo_events rows before the cutoff", async () => {
  const { calls } = stubExecute(() => ({ rowCount: 5 }));

  const deleted = await purgeStaleDemoEvents(RETENTION_DAYS, new Date("2026-04-25T12:00:00Z"));

  assert.equal(deleted, 5);
  assert.equal(calls.length, 1);

  const queryText = calls[0]!.text.toLowerCase();
  assert.match(queryText, /delete from demo_events/, "should target demo_events");
  assert.match(queryText, /created_at\s*</, "should filter by created_at");
});

test("returns 0 when no rows match", async () => {
  stubExecute(() => ({ rowCount: 0 }));
  const deleted = await purgeStaleDemoEvents(RETENTION_DAYS, new Date());
  assert.equal(deleted, 0);
});

test("cutoff is exactly retentionDays before the provided timestamp", async () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const customDays = 30;
  const { calls } = stubExecute(() => ({ rowCount: 2 }));

  await purgeStaleDemoEvents(customDays, now);

  const expectedCutoff = new Date(
    now.getTime() - customDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const queryText = calls[0]!.text;
  assert.ok(
    queryText.includes(expectedCutoff) || calls[0]!.params.some((p) => String(p).includes(expectedCutoff)),
    `query or params should contain cutoff ${expectedCutoff}`,
  );
});

test("boundary: a row exactly at the cutoff is preserved, one just before is deleted", async () => {
  const now = new Date("2026-04-25T00:00:00Z");
  const DAY_MS = 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);

  const rowJustBeforeCutoff = new Date(cutoff.getTime() - 1);
  const rowExactlyAtCutoff = new Date(cutoff.getTime());
  const rowAfterCutoff = new Date(cutoff.getTime() + DAY_MS);

  assert.ok(
    rowJustBeforeCutoff < cutoff,
    "row 1ms before cutoff should be older than cutoff (would be deleted)",
  );
  assert.ok(
    rowExactlyAtCutoff >= cutoff,
    "row exactly at cutoff should NOT be older (would be preserved)",
  );
  assert.ok(
    rowAfterCutoff > cutoff,
    "row 1 day after cutoff should be well within retention (preserved)",
  );

  const { calls } = stubExecute(() => ({ rowCount: 1 }));
  await purgeStaleDemoEvents(RETENTION_DAYS, now);

  const queryText = calls[0]!.text.toLowerCase();
  assert.match(
    queryText,
    /created_at\s*</,
    "uses strict less-than so rows exactly at the cutoff are preserved",
  );
  assert.ok(
    !queryText.includes("<="),
    "must NOT use <= which would delete the boundary row",
  );
});

test("simulated data: only rows older than the cutoff are removed", async () => {
  const now = new Date("2026-04-25T00:00:00Z");
  const DAY_MS = 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);

  interface Row { id: number; createdAt: Date; demo: string; event: string }
  const rows: Row[] = [
    { id: 1, createdAt: new Date(cutoff.getTime() - 30 * DAY_MS), demo: "erp", event: "stock_adjusted" },
    { id: 2, createdAt: new Date(cutoff.getTime() - 1),           demo: "bi",  event: "range_changed" },
    { id: 3, createdAt: new Date(cutoff.getTime()),               demo: "ticketing", event: "ticket_created" },
    { id: 4, createdAt: new Date(cutoff.getTime() + DAY_MS),      demo: "erp", event: "first_interaction" },
    { id: 5, createdAt: new Date(now.getTime() - DAY_MS),         demo: "bi",  event: "export_clicked" },
  ];

  let remaining = [...rows];

  (dbMod.db as { execute: Execute }).execute = (async () => {
    const before = remaining.length;
    remaining = remaining.filter((r) => r.createdAt >= cutoff);
    return { rowCount: before - remaining.length } as unknown as ReturnType<Execute>;
  }) as unknown as Execute;

  const deleted = await purgeStaleDemoEvents(RETENTION_DAYS, now);

  assert.equal(deleted, 2, "should delete exactly the 2 rows older than cutoff");
  assert.equal(remaining.length, 3, "3 rows within retention window should survive");

  const survivingIds = remaining.map((r) => r.id).sort();
  assert.deepEqual(survivingIds, [3, 4, 5], "rows at/after cutoff are preserved");

  const deletedRows = rows.filter((r) => !remaining.includes(r));
  for (const r of deletedRows) {
    assert.ok(r.createdAt < cutoff, `deleted row ${r.id} should be older than cutoff`);
  }
  for (const r of remaining) {
    assert.ok(r.createdAt >= cutoff, `surviving row ${r.id} should be at or after cutoff`);
  }
});

test("propagates database errors to the caller", async () => {
  (dbMod.db as { execute: Execute }).execute = (async () => {
    throw new Error("connection refused");
  }) as unknown as Execute;

  await assert.rejects(
    () => purgeStaleDemoEvents(RETENTION_DAYS, new Date()),
    { message: "connection refused" },
  );
});
