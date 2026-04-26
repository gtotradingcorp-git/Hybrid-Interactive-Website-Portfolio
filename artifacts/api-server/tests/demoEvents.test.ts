import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";
// Force the in-memory limiter so the test never touches Postgres.
process.env["RATE_LIMIT_BACKEND"] = "memory";

const originalConsoleError = console.error;
const originalConsoleLog = console.log;
console.error = () => {};
console.log = () => {};

const { default: app } = await import("../src/app.ts");
const dbMod = await import("@workspace/db");
const { _resetDemoEventsRateLimit } = await import(
  "../src/routes/demoEvents.ts"
);

type Insert = typeof dbMod.db.insert;
const originalInsert: Insert = dbMod.db.insert.bind(dbMod.db) as Insert;

interface InsertedRow {
  demo: unknown;
  event: unknown;
}
let inserted: InsertedRow[] = [];
let insertShouldThrow = false;

function stubInsertCapture(): void {
  (dbMod.db as { insert: Insert }).insert = (() => ({
    values: async (row: InsertedRow) => {
      if (insertShouldThrow) {
        throw new Error("simulated DB failure");
      }
      inserted.push(row);
      return [];
    },
  })) as unknown as Insert;
}

function restoreDb(): void {
  (dbMod.db as { insert: Insert }).insert = originalInsert;
}

let server: Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
  stubInsertCapture();
});

beforeEach(async () => {
  inserted = [];
  insertShouldThrow = false;
  await _resetDemoEventsRateLimit();
});

after(async () => {
  restoreDb();
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("accepts a valid demo event and stores only allow-listed fields", async () => {
  const res = await fetch(`${baseUrl}/api/demo-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demo: "ticketing", event: "ticket_created" }),
  });
  assert.equal(res.status, 204);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0]?.demo, "ticketing");
  assert.equal(inserted[0]?.event, "ticket_created");
  // No PII keys should sneak through, even if the client sends them.
  assert.deepEqual(Object.keys(inserted[0] ?? {}).sort(), ["demo", "event"]);
});

test("ignores extra fields and only persists demo + event", async () => {
  const res = await fetch(`${baseUrl}/api/demo-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      demo: "erp",
      event: "stock_adjusted",
      visitorId: "should-be-dropped",
      ip: "1.2.3.4",
    }),
  });
  assert.equal(res.status, 204);
  assert.equal(inserted.length, 1);
  assert.deepEqual(Object.keys(inserted[0] ?? {}).sort(), ["demo", "event"]);
});

test("rejects unknown demo slug with 400", async () => {
  const res = await fetch(`${baseUrl}/api/demo-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demo: "marketing", event: "ticket_created" }),
  });
  assert.equal(res.status, 400);
  assert.equal(inserted.length, 0);
});

test("rejects unknown event name with 400", async () => {
  const res = await fetch(`${baseUrl}/api/demo-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demo: "bi", event: "stole_data" }),
  });
  assert.equal(res.status, 400);
  assert.equal(inserted.length, 0);
});

test("returns 202 soft-fail when the DB insert throws", async () => {
  insertShouldThrow = true;
  const res = await fetch(`${baseUrl}/api/demo-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demo: "bi", event: "range_changed" }),
  });
  // Telemetry must never block the user — soft success keeps the demos
  // working even if the analytics table is unavailable.
  assert.equal(res.status, 202);
  assert.equal(inserted.length, 0);
});

test("rate-limits after 60 requests in the same window", async () => {
  // Burst 60 acceptable requests, then assert the 61st is rejected.
  for (let i = 0; i < 60; i += 1) {
    const ok = await fetch(`${baseUrl}/api/demo-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo: "ticketing", event: "first_interaction" }),
    });
    assert.equal(ok.status, 204, `request ${i + 1} should succeed`);
  }
  const limited = await fetch(`${baseUrl}/api/demo-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demo: "ticketing", event: "first_interaction" }),
  });
  assert.equal(limited.status, 429);
});
