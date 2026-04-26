import { test } from "node:test";
import assert from "node:assert/strict";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";

const { renderDigestEmail, sendWeeklyDigest } = await import(
  "../src/lib/weeklyDigest.ts"
);
const { estimateCostUsd } = await import("../src/lib/usageSummary.ts");
const dbMod = await import("@workspace/db");

const realFetch: typeof fetch = globalThis.fetch.bind(globalThis);
function setFetch(impl: typeof fetch): void {
  (globalThis as { fetch: typeof fetch }).fetch = impl;
}

interface FakeSummary {
  windowDays: number;
  periodStart: Date;
  periodEnd: Date;
  totals: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  daily: Array<{ day: string; requests: number; tokens: number }>;
  byTopic: Array<{ topic: string; requests: number; tokens: number }>;
  previousPeriodStart: Date;
  previousPeriodEnd: Date;
  previousByTopic: Array<{ topic: string; requests: number; tokens: number }>;
}

function makeSummary(overrides: Partial<FakeSummary> = {}): FakeSummary {
  return {
    windowDays: 7,
    periodStart: new Date("2026-04-12T00:00:00Z"),
    periodEnd: new Date("2026-04-19T00:00:00Z"),
    previousPeriodStart: new Date("2026-04-05T00:00:00Z"),
    previousPeriodEnd: new Date("2026-04-12T00:00:00Z"),
    totals: {
      requests: 7,
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      estimatedCostUsd: 0.0025,
    },
    daily: [{ day: "2026-04-15", requests: 7, tokens: 300 }],
    byTopic: [{ topic: "ai", requests: 7, tokens: 300 }],
    previousByTopic: [],
    ...overrides,
  };
}

// Stub db.execute (used to read last digest send time) and db.insert (used to
// record digest send rows). We restore originals after each test to keep tests
// isolated.
type Execute = typeof dbMod.db.execute;
type Insert = typeof dbMod.db.insert;
const originalExecute: Execute = dbMod.db.execute.bind(dbMod.db) as Execute;
const originalInsert: Insert = dbMod.db.insert.bind(dbMod.db) as Insert;

function stubExecute(rows: unknown[]): void {
  (dbMod.db as { execute: Execute }).execute = (async () => ({
    rows,
  })) as unknown as Execute;
}

interface InsertCapture {
  value: Record<string, unknown> | null;
}
function stubInsert(capture: InsertCapture): void {
  (dbMod.db as { insert: Insert }).insert = ((_table: unknown) => ({
    values: async (v: Record<string, unknown>) => {
      capture.value = v;
    },
  })) as unknown as Insert;
}
function restoreDb(): void {
  (dbMod.db as { execute: Execute }).execute = originalExecute;
  (dbMod.db as { insert: Insert }).insert = originalInsert;
}

test("renderDigestEmail produces a plain-text summary with totals and topics", () => {
  const summary = makeSummary({
    totals: {
      requests: 42,
      promptTokens: 12_345,
      completionTokens: 6_789,
      totalTokens: 19_134,
      estimatedCostUsd: 0.1234,
    },
    daily: [
      { day: "2026-04-12", requests: 10, tokens: 5000 },
      { day: "2026-04-13", requests: 32, tokens: 14_134 },
    ],
    byTopic: [
      { topic: "leadership", requests: 25, tokens: 11_000 },
      { topic: "ai", requests: 17, tokens: 8_134 },
    ],
  });

  const { subject, text } = renderDigestEmail(summary);

  assert.match(subject, /42 requests/);
  assert.match(subject, /\$0\.12/);
  assert.match(subject, /2026-04-12/);
  assert.match(subject, /2026-04-19/);

  assert.match(text, /Requests: 42/);
  assert.match(text, /leadership: 25 requests/);
  assert.match(text, /ai: 17 requests/);
  assert.match(text, /2026-04-13: 32 requests/);
  assert.match(text, /Estimated cost: \$0\.1234/);
});

test("renderDigestEmail handles a quiet week with no activity", () => {
  const summary = makeSummary({
    totals: {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    },
    daily: [],
    byTopic: [],
  });
  const { text } = renderDigestEmail(summary);
  assert.match(text, /no chat activity this week/);
});

test("estimateCostUsd uses gpt-4o pricing", () => {
  // $2.50 input + $10.00 output per 1M tokens.
  assert.equal(estimateCostUsd(1_000_000, 1_000_000), 12.5);
});

function fakeConfig(over: Partial<{
  recipients: string[];
  sendDay: number | null;
  sendHour: number | null;
  paused: boolean;
}> = {}) {
  return async () => ({
    recipients: ["cs_info@agentmail.to"],
    sendDay: null,
    sendHour: null,
    paused: false,
    ...over,
  });
}

test("sendWeeklyDigest skips when a recent send exists", async () => {
  stubExecute([{ sent_at: new Date().toISOString() }]);
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);

  let transportCalled = false;
  try {
    const result = await sendWeeklyDigest({
      summaryProvider: async () => makeSummary(),
      configProvider: fakeConfig(),
      send: async () => {
        transportCalled = true;
      },
    });
    assert.equal(result.status, "skipped");
    assert.equal(transportCalled, false, "should not send when skipping");
    assert.equal(insertCapture.value, null, "should not record a send row");
  } finally {
    restoreDb();
  }
});

test("sendWeeklyDigest skips when paused", async () => {
  stubExecute([]);
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);
  let transportCalled = false;
  try {
    const result = await sendWeeklyDigest({
      summaryProvider: async () => makeSummary(),
      configProvider: fakeConfig({ paused: true }),
      send: async () => {
        transportCalled = true;
      },
    });
    assert.equal(result.status, "skipped");
    assert.match(result.reason ?? "", /paused/i);
    assert.equal(transportCalled, false);
  } finally {
    restoreDb();
  }
});

test("sendWeeklyDigest skips when not the configured send day/hour", async () => {
  stubExecute([]);
  stubInsert({ value: null });
  // Wednesday 2026-04-15 at 09:00 UTC. getUTCDay() = 3.
  const now = new Date("2026-04-15T09:00:00Z");
  try {
    const wrongDay = await sendWeeklyDigest({
      now,
      summaryProvider: async () => makeSummary(),
      configProvider: fakeConfig({ sendDay: 1 }),
      send: async () => {},
    });
    assert.equal(wrongDay.status, "skipped");
    assert.match(wrongDay.reason ?? "", /day/i);

    const wrongHour = await sendWeeklyDigest({
      now,
      summaryProvider: async () => makeSummary(),
      configProvider: fakeConfig({ sendDay: 3, sendHour: 14 }),
      send: async () => {},
    });
    assert.equal(wrongHour.status, "skipped");
    assert.match(wrongHour.reason ?? "", /hour/i);
  } finally {
    restoreDb();
  }
});

test("sendWeeklyDigest sends to all configured recipients", async () => {
  stubExecute([]);
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);
  // Match Wednesday 09:00 UTC.
  const now = new Date("2026-04-15T09:00:00Z");
  let captured: { to: string[] } | null = null;
  try {
    const result = await sendWeeklyDigest({
      now,
      summaryProvider: async () => makeSummary(),
      configProvider: fakeConfig({
        recipients: ["a@example.com", "b@example.com"],
        sendDay: 3,
        sendHour: 9,
      }),
      send: async (to) => {
        captured = { to };
      },
    });
    assert.equal(result.status, "sent");
    assert.deepEqual(captured!.to, ["a@example.com", "b@example.com"]);
    assert.deepEqual(result.recipients, ["a@example.com", "b@example.com"]);
  } finally {
    restoreDb();
  }
});

test("sendWeeklyDigest with force=true sends and records the send", async () => {
  stubExecute([]);
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);

  let captured: { subject: string; text: string } | null = null;
  try {
    const result = await sendWeeklyDigest({
      force: true,
      summaryProvider: async () =>
        makeSummary({
          totals: {
            requests: 7,
            promptTokens: 100,
            completionTokens: 200,
            totalTokens: 300,
            estimatedCostUsd: 0.0025,
          },
        }),
      send: async (_to, subject, text) => {
        captured = { subject, text };
      },
    });
    assert.equal(result.status, "sent");
    assert.ok(captured, "transport should have been called");
    assert.match(captured!.subject, /7 requests/);
    assert.match(captured!.text, /Requests: 7/);
    assert.ok(insertCapture.value, "should record a digest log row");
    assert.equal(
      (insertCapture.value as { status: string }).status,
      "sent",
    );
    assert.equal(
      (insertCapture.value as { requests: number }).requests,
      7,
    );
  } finally {
    restoreDb();
  }
});

test("sendWeeklyDigest records a failure when the transport throws", async () => {
  stubExecute([]);
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);

  const originalErr = console.error;
  console.error = () => {};
  try {
    const result = await sendWeeklyDigest({
      force: true,
      summaryProvider: async () => makeSummary(),
      send: async () => {
        throw new Error("AgentMail 500: nope");
      },
    });
    assert.equal(result.status, "failed");
    assert.match(result.reason ?? "", /AgentMail 500/);
    assert.ok(insertCapture.value);
    assert.equal(
      (insertCapture.value as { status: string }).status,
      "failed",
    );
    assert.match(
      String((insertCapture.value as { errorMessage?: string }).errorMessage ?? ""),
      /AgentMail 500/,
    );
  } finally {
    console.error = originalErr;
    restoreDb();
  }
});

test("admin route triggers the digest with force=true", async () => {
  process.env["ADMIN_TOKEN"] = "admin-secret";
  const { default: app } = await import("../src/app.ts");
  const http = await import("node:http");

  // Stub db so getUsageSummary doesn't try to talk to a real database.
  const stubRows: unknown[] = [];
  (dbMod.db as { execute: Execute }).execute = (async () => ({
    rows: stubRows,
  })) as unknown as Execute;
  (dbMod.db as unknown as {
    select: (..._args: unknown[]) => unknown;
  }).select = () => ({
    from: () => ({
      where: async () => [
        {
          totalRequests: 0,
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
        },
      ],
    }),
  });
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);

  setFetch((async () =>
    new Response("{}", { status: 200 })) as unknown as typeof fetch);
  process.env["AGENTMAIL_API_KEY"] = "test-key";

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const res = await realFetch(`${baseUrl}/api/admin/weekly-digest?force=1`, {
      method: "POST",
      headers: { Authorization: "Bearer admin-secret" },
    });
    const body = (await res.json()) as { status: string };
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.status, "sent");

    // Without auth, the endpoint must reject.
    const unauth = await realFetch(`${baseUrl}/api/admin/weekly-digest`, {
      method: "POST",
    });
    assert.equal(unauth.status, 401);
  } finally {
    setFetch(realFetch);
    restoreDb();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
