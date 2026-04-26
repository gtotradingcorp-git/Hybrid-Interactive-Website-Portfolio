import { test } from "node:test";
import assert from "node:assert/strict";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";

const {
  checkAndSendCostAlert,
  renderCostAlertEmail,
  getDailyCostThresholdUsd,
  maybeCheckCostAlert,
  _resetCostAlertThrottle,
} = await import("../src/lib/costAlert.ts");
const dbMod = await import("@workspace/db");

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

function makeUsage(overrides: Partial<{
  day: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}> = {}) {
  return {
    day: "2026-04-19",
    requests: 1000,
    promptTokens: 500_000,
    completionTokens: 500_000,
    totalTokens: 1_000_000,
    estimatedCostUsd: 6.25,
    ...overrides,
  };
}

test("renderCostAlertEmail includes day, requests, and cost", () => {
  const { subject, text } = renderCostAlertEmail(
    makeUsage({ requests: 1234, estimatedCostUsd: 12.3456 }),
    5,
  );
  assert.match(subject, /\$12\.35/);
  assert.match(subject, /\$5\.00/);
  assert.match(subject, /2026-04-19/);
  assert.match(text, /Requests: 1234/);
  assert.match(text, /Threshold: \$5\.0000/);
  assert.match(text, /Estimated cost so far: \$12\.3456/);
});

test("getDailyCostThresholdUsd parses positive numbers and rejects junk", () => {
  const original = process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  try {
    delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
    assert.equal(getDailyCostThresholdUsd(), null);
    process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = "0";
    assert.equal(getDailyCostThresholdUsd(), null);
    process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = "abc";
    assert.equal(getDailyCostThresholdUsd(), null);
    process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = "2.5";
    assert.equal(getDailyCostThresholdUsd(), 2.5);
  } finally {
    if (original === undefined) delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
    else process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = original;
  }
});

test("checkAndSendCostAlert skips when no threshold is configured", async () => {
  const original = process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  try {
    const result = await checkAndSendCostAlert();
    assert.equal(result.status, "skipped");
    assert.match(result.reason ?? "", /not configured/i);
  } finally {
    if (original !== undefined) process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = original;
  }
});

test("checkAndSendCostAlert skips when usage is below threshold", async () => {
  let sent = false;
  const result = await checkAndSendCostAlert({
    thresholdUsd: 10,
    usageProvider: async () => makeUsage({ estimatedCostUsd: 3.5 }),
    send: async () => {
      sent = true;
    },
  });
  assert.equal(result.status, "skipped");
  assert.match(result.reason ?? "", /below threshold/i);
  assert.equal(sent, false);
});

test("checkAndSendCostAlert sends and records when threshold is exceeded", async () => {
  stubExecute([]); // alreadySentToday -> false
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);

  let captured: { subject: string; text: string } | null = null;
  try {
    const result = await checkAndSendCostAlert({
      thresholdUsd: 5,
      usageProvider: async () =>
        makeUsage({ requests: 999, estimatedCostUsd: 9.87 }),
      send: async (subject, text) => {
        captured = { subject, text };
      },
    });
    assert.equal(result.status, "sent");
    assert.ok(captured, "transport should have been called");
    assert.match(captured!.subject, /\$9\.87/);
    assert.match(captured!.text, /Requests: 999/);
    assert.ok(insertCapture.value);
    assert.equal((insertCapture.value as { status: string }).status, "sent");
    assert.equal((insertCapture.value as { requests: number }).requests, 999);
    assert.equal(
      (insertCapture.value as { thresholdUsd: number }).thresholdUsd,
      5,
    );
  } finally {
    restoreDb();
  }
});

test("checkAndSendCostAlert skips when an alert was already sent today", async () => {
  stubExecute([{ id: 1 }]); // alreadySentToday -> true
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);

  let sent = false;
  try {
    const result = await checkAndSendCostAlert({
      thresholdUsd: 5,
      usageProvider: async () => makeUsage({ estimatedCostUsd: 9.87 }),
      send: async () => {
        sent = true;
      },
    });
    assert.equal(result.status, "skipped");
    assert.match(result.reason ?? "", /already alerted/i);
    assert.equal(sent, false);
    assert.equal(insertCapture.value, null);
  } finally {
    restoreDb();
  }
});

test("checkAndSendCostAlert records a failure row when transport throws", async () => {
  stubExecute([]);
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);

  const originalErr = console.error;
  console.error = () => {};
  try {
    const result = await checkAndSendCostAlert({
      thresholdUsd: 5,
      usageProvider: async () => makeUsage({ estimatedCostUsd: 9.87 }),
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

test("maybeCheckCostAlert is a no-op when threshold is not set", async () => {
  const original = process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  _resetCostAlertThrottle();

  // Make db calls explode if anything actually tried to talk to it.
  (dbMod.db as { execute: Execute }).execute = (async () => {
    throw new Error("should not be called");
  }) as unknown as Execute;

  try {
    maybeCheckCostAlert();
    // Give the (would-be) async work a tick.
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    restoreDb();
    if (original !== undefined) process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = original;
  }
});

test("admin route triggers a forced cost-alert check", async () => {
  process.env["ADMIN_TOKEN"] = "admin-secret";
  process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = "1";
  process.env["AGENTMAIL_API_KEY"] = "test-key";
  const { default: app } = await import("../src/app.ts");
  const http = await import("node:http");
  // Earlier tests may have cached the config with a null threshold; force a
  // re-read so the env var set above is picked up.
  const { _resetCostAlertConfigCache } = await import(
    "../src/lib/costAlertConfig.ts"
  );
  _resetCostAlertConfigCache();

  // Stub today usage via raw SQL execute and insert recording.
  stubExecute([
    {
      requests: 100,
      prompt_tokens: 2_000_000,
      completion_tokens: 2_000_000,
      total_tokens: 4_000_000,
    },
  ]);
  const insertCapture: InsertCapture = { value: null };
  stubInsert(insertCapture);

  const realFetch: typeof fetch = globalThis.fetch.bind(globalThis);
  (globalThis as { fetch: typeof fetch }).fetch = (async () =>
    new Response("{}", { status: 200 })) as unknown as typeof fetch;

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const res = await realFetch(
      `${baseUrl}/api/admin/cost-alert-check?force=1`,
      {
        method: "POST",
        headers: { Authorization: "Bearer admin-secret" },
      },
    );
    const body = (await res.json()) as { status: string };
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.status, "sent");

    // Without auth, the endpoint must reject.
    const unauth = await realFetch(`${baseUrl}/api/admin/cost-alert-check`, {
      method: "POST",
    });
    assert.equal(unauth.status, 401);
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = realFetch;
    restoreDb();
    delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
