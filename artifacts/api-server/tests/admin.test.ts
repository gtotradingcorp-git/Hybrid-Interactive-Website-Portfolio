import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";
process.env["ADMIN_TOKEN"] = "admin-secret";

const originalConsoleError = console.error;
const originalConsoleLog = console.log;
console.error = () => {};
console.log = () => {};

const { default: app } = await import("../src/app.ts");
const dbMod = await import("@workspace/db");

type Select = typeof dbMod.db.select;
type Execute = typeof dbMod.db.execute;
const originalSelect: Select = dbMod.db.select.bind(dbMod.db) as Select;
const originalExecute: Execute = dbMod.db.execute.bind(dbMod.db) as Execute;

// Stub the drizzle `select().from().where()` chain that getUsageSummary uses
// for the totals row, returning a single row with deterministic numbers.
function stubSelectTotals(row: Record<string, unknown>): void {
  (dbMod.db as { select: Select }).select = (() => ({
    from: () => ({
      where: async () => [row],
    }),
  })) as unknown as Select;
}

// Stub raw `db.execute` results for the daily/topic SQL queries. The route
// pulls `.rows` off the result, so we wrap the data accordingly.
function stubExecuteSequence(results: unknown[][]): void {
  let i = 0;
  (dbMod.db as { execute: Execute }).execute = (async () => {
    const rows = results[i] ?? [];
    i += 1;
    return { rows };
  }) as unknown as Execute;
}

function restoreDb(): void {
  (dbMod.db as { select: Select }).select = originalSelect;
  (dbMod.db as { execute: Execute }).execute = originalExecute;
}

let server: Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  restoreDb();
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("rejects /admin/usage without a token", async () => {
  const res = await fetch(`${baseUrl}/api/admin/usage`);
  assert.equal(res.status, 401);
  const json = (await res.json()) as { error?: string };
  assert.match(json.error ?? "", /unauthorized/i);
});

test("rejects /admin/usage with the wrong token", async () => {
  const res = await fetch(`${baseUrl}/api/admin/usage`, {
    headers: { Authorization: "Bearer not-the-secret" },
  });
  assert.equal(res.status, 401);
});

test("returns the usage-stats shape with a valid token", async () => {
  stubSelectTotals({
    totalRequests: 42,
    totalTokens: 1000,
    promptTokens: 600,
    completionTokens: 400,
  });
  stubExecuteSequence([
    [
      { day: "2026-04-18", requests: 20, tokens: 500 },
      { day: "2026-04-19", requests: 22, tokens: 500 },
    ],
    [
      { topic: "career", requests: 30, tokens: 700 },
      { topic: "technical", requests: 12, tokens: 300 },
    ],
    // Prior-period byTopic — same shape, used for vs-previous deltas.
    [
      { topic: "career", requests: 18, tokens: 400 },
      { topic: "technical", requests: 6, tokens: 100 },
    ],
  ]);
  try {
    const res = await fetch(`${baseUrl}/api/admin/usage`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      windowDays: number;
      totals: {
        requests: number;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
      };
      daily: Array<{ day: string; requests: number; tokens: number }>;
      byTopic: Array<{ topic: string; requests: number; tokens: number }>;
      previousByTopic: Array<{ topic: string; requests: number; tokens: number }>;
    };
    assert.equal(body.windowDays, 30);
    assert.equal(body.totals.requests, 42);
    assert.equal(body.totals.promptTokens, 600);
    assert.equal(body.totals.completionTokens, 400);
    assert.equal(body.totals.totalTokens, 1000);
    assert.equal(typeof body.totals.estimatedCostUsd, "number");
    assert.equal(body.daily.length, 2);
    assert.equal(body.daily[0]!.day, "2026-04-18");
    assert.equal(body.byTopic.length, 2);
    assert.equal(body.byTopic[0]!.topic, "career");
    // The endpoint must surface the prior-period topic counts so the UI can
    // render a vs-previous-period delta without a second round-trip.
    assert.ok(Array.isArray(body.previousByTopic));
    assert.equal(body.previousByTopic.length, 2);
    assert.equal(body.previousByTopic[0]!.topic, "career");
    assert.equal(body.previousByTopic[0]!.requests, 18);
    assert.equal(body.previousByTopic[1]!.topic, "technical");
    assert.equal(body.previousByTopic[1]!.requests, 6);
  } finally {
    restoreDb();
  }
});

test("/admin/usage flags topics that are new versus the previous period", async () => {
  stubSelectTotals({
    totalRequests: 10,
    totalTokens: 200,
    promptTokens: 120,
    completionTokens: 80,
  });
  stubExecuteSequence([
    [],
    [
      { topic: "leadership", requests: 6, tokens: 120 },
      { topic: "ai", requests: 4, tokens: 80 },
    ],
    // Prior period only had "leadership" — "ai" is brand new this window.
    [{ topic: "leadership", requests: 9, tokens: 180 }],
  ]);
  try {
    const res = await fetch(`${baseUrl}/api/admin/usage`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      byTopic: Array<{ topic: string; requests: number }>;
      previousByTopic: Array<{ topic: string; requests: number }>;
    };
    const prevTopics = new Set(body.previousByTopic.map((r) => r.topic));
    const currentTopics = body.byTopic.map((r) => r.topic);
    assert.ok(currentTopics.includes("ai"));
    assert.equal(prevTopics.has("ai"), false);
    assert.equal(prevTopics.has("leadership"), true);
  } finally {
    restoreDb();
  }
});

test("/admin/usage honors and clamps the windowDays query param", async () => {
  stubSelectTotals({
    totalRequests: 1,
    totalTokens: 10,
    promptTokens: 6,
    completionTokens: 4,
  });
  // Three execute calls: daily, current byTopic, previous byTopic.
  stubExecuteSequence([[], [], []]);
  try {
    const res = await fetch(`${baseUrl}/api/admin/usage?windowDays=7`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { windowDays: number };
    assert.equal(body.windowDays, 7);
  } finally {
    restoreDb();
  }

  stubSelectTotals({
    totalRequests: 1,
    totalTokens: 10,
    promptTokens: 6,
    completionTokens: 4,
  });
  stubExecuteSequence([[], [], []]);
  try {
    const res = await fetch(`${baseUrl}/api/admin/usage?windowDays=9999`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { windowDays: number };
    assert.equal(body.windowDays, 90);
  } finally {
    restoreDb();
  }

  stubSelectTotals({
    totalRequests: 1,
    totalTokens: 10,
    promptTokens: 6,
    completionTokens: 4,
  });
  stubExecuteSequence([[], [], []]);
  try {
    const res = await fetch(`${baseUrl}/api/admin/usage?windowDays=garbage`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { windowDays: number };
    assert.equal(body.windowDays, 30);
  } finally {
    restoreDb();
  }
});

test("/admin/usage clamps windowDays at the lower bound", async () => {
  stubSelectTotals({
    totalRequests: 1,
    totalTokens: 10,
    promptTokens: 6,
    completionTokens: 4,
  });
  stubExecuteSequence([[], []]);
  try {
    const res = await fetch(`${baseUrl}/api/admin/usage?windowDays=0`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { windowDays: number };
    assert.equal(body.windowDays, 1);
  } finally {
    restoreDb();
  }

  stubSelectTotals({
    totalRequests: 1,
    totalTokens: 10,
    promptTokens: 6,
    completionTokens: 4,
  });
  stubExecuteSequence([[], []]);
  try {
    const res = await fetch(`${baseUrl}/api/admin/usage?windowDays=-5`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { windowDays: number };
    assert.equal(body.windowDays, 1);
  } finally {
    restoreDb();
  }
});

test("/admin/cache-stats requires auth", async () => {
  const res = await fetch(`${baseUrl}/api/admin/cache-stats`);
  assert.equal(res.status, 401);
});

test("/admin/cache-stats reports zero-state cleanly when nothing is cached", async () => {
  const tc = await import("../src/lib/topicClassifier.ts");
  tc._resetTopicCache();
  const res = await fetch(`${baseUrl}/api/admin/cache-stats`, {
    headers: { Authorization: "Bearer admin-secret" },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    size: number;
    hits: number;
    misses: number;
    hitRatio: number;
  };
  assert.equal(body.size, 0);
  assert.equal(body.hits, 0);
  assert.equal(body.misses, 0);
  assert.equal(body.hitRatio, 0);
});

test("/admin/cache-stats reflects hits and misses after classifier runs", async () => {
  const tc = await import("../src/lib/topicClassifier.ts");
  tc._resetTopicCache();

  // Stub the upstream OpenAI-compatible classifier so the AI path returns a
  // valid label without making a real network call.
  const prevBase = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const prevKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = "https://stub.example.com/v1";
  process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = "stub-key";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("stub.example.com")) {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "projects" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;

  try {
    // First call: cache miss + AI lookup.
    await tc.classifyTopicWithAI("Tell me about your projects");
    // Second call: same normalized question, should be a cache hit.
    await tc.classifyTopicWithAI("Tell me about your projects!");
    // Third call: different question, another miss.
    await tc.classifyTopicWithAI("What technologies do you use?");

    const res = await fetch(`${baseUrl}/api/admin/cache-stats`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      size: number;
      hits: number;
      misses: number;
      hitRatio: number;
    };
    assert.equal(body.hits, 1);
    assert.equal(body.misses, 2);
    assert.equal(body.size, 2);
    // Hit ratio = 1 / (1 + 2) ≈ 0.3333
    assert.ok(Math.abs(body.hitRatio - 1 / 3) < 1e-9);
  } finally {
    globalThis.fetch = realFetch;
    if (prevBase === undefined) delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
    else process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = prevBase;
    if (prevKey === undefined) delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
    else process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = prevKey;
    tc._resetTopicCache();
  }
});

test("weekly digest config: GET returns defaults, PATCH updates and persists", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "digest-config-"));
  const configFile = path.join(tmp, "config.json");
  const prev = process.env["WEEKLY_DIGEST_CONFIG_FILE"];
  process.env["WEEKLY_DIGEST_CONFIG_FILE"] = configFile;
  const { _resetDigestConfigCache } = await import("../src/lib/digestConfig.ts");
  _resetDigestConfigCache();
  try {
    const get = await fetch(`${baseUrl}/api/admin/weekly-digest/config`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(get.status, 200);
    const initial = (await get.json()) as {
      recipients: string[];
      sendDay: number | null;
      sendHour: number | null;
      paused: boolean;
    };
    assert.deepEqual(initial.recipients, ["cs_info@agentmail.to"]);
    assert.equal(initial.paused, false);

    const patch = await fetch(`${baseUrl}/api/admin/weekly-digest/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: ["a@example.com", "b@example.com"],
        sendDay: 1,
        sendHour: 14,
        paused: true,
      }),
    });
    assert.equal(patch.status, 200);
    const updated = (await patch.json()) as { recipients: string[]; sendDay: number; sendHour: number; paused: boolean };
    assert.deepEqual(updated.recipients, ["a@example.com", "b@example.com"]);
    assert.equal(updated.sendDay, 1);
    assert.equal(updated.sendHour, 14);
    assert.equal(updated.paused, true);

    // Confirm persistence to disk.
    const onDisk = JSON.parse(await fs.readFile(configFile, "utf8")) as {
      recipients: string[];
      paused: boolean;
    };
    assert.deepEqual(onDisk.recipients, ["a@example.com", "b@example.com"]);
    assert.equal(onDisk.paused, true);

    // Validation: bad email should reject.
    const bad = await fetch(`${baseUrl}/api/admin/weekly-digest/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipients: ["not-an-email"] }),
    });
    assert.equal(bad.status, 400);

    // Validation: bad sendHour should reject.
    const badHour = await fetch(`${baseUrl}/api/admin/weekly-digest/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sendHour: 99 }),
    });
    assert.equal(badHour.status, 400);

    // Unauthorized request rejected.
    const unauth = await fetch(`${baseUrl}/api/admin/weekly-digest/config`);
    assert.equal(unauth.status, 401);
  } finally {
    if (prev === undefined) delete process.env["WEEKLY_DIGEST_CONFIG_FILE"];
    else process.env["WEEKLY_DIGEST_CONFIG_FILE"] = prev;
    _resetDigestConfigCache();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// Stub the drizzle `select().from().orderBy().limit()` chain that the admin
// list endpoints (recent questions, weekly digests, cost alerts, match logs)
// use. Returns an array of `n` rows so callers can assert how the route
// clamped the requested limit just by counting items in the response.
function stubSelectLimit(
  makeRow: (i: number) => Record<string, unknown>,
): { lastLimit: number | null } {
  const state: { lastLimit: number | null } = { lastLimit: null };
  (dbMod.db as { select: Select }).select = (() => ({
    from: () => ({
      orderBy: () => ({
        limit: async (n: number) => {
          state.lastLimit = n;
          return Array.from({ length: n }, (_, i) => makeRow(i));
        },
      }),
    }),
  })) as unknown as Select;
  return state;
}

async function assertLimitClamp(
  pathWithoutQuery: string,
  upperBound: number,
  makeRow: (i: number) => Record<string, unknown>,
): Promise<void> {
  const headers = { Authorization: "Bearer admin-secret" } as const;

  // limit=0 -> clamped to 1
  let state = stubSelectLimit(makeRow);
  try {
    const res = await fetch(`${baseUrl}${pathWithoutQuery}?limit=0`, { headers });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: unknown[] };
    assert.equal(state.lastLimit, 1, `${pathWithoutQuery} limit=0 should clamp to 1`);
    assert.equal(body.items.length, 1);
  } finally {
    restoreDb();
  }

  // limit=-5 -> clamped to 1
  state = stubSelectLimit(makeRow);
  try {
    const res = await fetch(`${baseUrl}${pathWithoutQuery}?limit=-5`, { headers });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: unknown[] };
    assert.equal(state.lastLimit, 1, `${pathWithoutQuery} limit=-5 should clamp to 1`);
    assert.equal(body.items.length, 1);
  } finally {
    restoreDb();
  }

  // limit=9999 -> clamped to upperBound
  state = stubSelectLimit(makeRow);
  try {
    const res = await fetch(`${baseUrl}${pathWithoutQuery}?limit=9999`, { headers });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: unknown[] };
    assert.equal(
      state.lastLimit,
      upperBound,
      `${pathWithoutQuery} limit=9999 should clamp to ${upperBound}`,
    );
    assert.equal(body.items.length, upperBound);
  } finally {
    restoreDb();
  }
}

test("/admin/recent-questions clamps limit to 1..100", async () => {
  await assertLimitClamp("/api/admin/recent-questions", 100, (i) => ({
    id: i + 1,
    createdAt: new Date("2026-04-20T00:00:00Z"),
    topic: "projects",
    question: `q${i}`,
  }));
});

test("/admin/weekly-digest/recent clamps limit to 1..50", async () => {
  await assertLimitClamp("/api/admin/weekly-digest/recent", 50, (i) => ({
    id: i + 1,
    sentAt: new Date("2026-04-20T00:00:00Z"),
    periodStart: new Date("2026-04-13T00:00:00Z"),
    periodEnd: new Date("2026-04-20T00:00:00Z"),
    requests: i,
    totalTokens: i * 10,
    estimatedCostUsd: "0.01",
    status: "sent",
    errorMessage: null,
  }));
});

test("/admin/cost-alerts/recent clamps limit to 1..50", async () => {
  await assertLimitClamp("/api/admin/cost-alerts/recent", 50, (i) => ({
    id: i + 1,
    sentAt: new Date("2026-04-20T00:00:00Z"),
    day: "2026-04-20",
    requests: i,
    totalTokens: i * 10,
    estimatedCostUsd: "0.50",
    thresholdUsd: "1.00",
    status: "sent",
    errorMessage: null,
  }));
});

test("/admin/match-logs clamps limit to 1..100", async () => {
  await assertLimitClamp("/api/admin/match-logs", 100, (i) => ({
    id: i + 1,
    createdAt: new Date("2026-04-20T00:00:00Z"),
    roleTitle: `Role ${i}`,
    recruiterCompany: "Acme",
    recruiterEmailDomain: "acme.com",
    fitScore: 80,
    shareCount: 0,
    jdLength: 1000,
    estimatedCostUsd: "0.02",
  }));
});

test("cost alert config: GET returns defaults, PATCH updates and validates", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cost-alert-config-"));
  const configFile = path.join(tmp, "config.json");
  const prevFile = process.env["COST_ALERT_CONFIG_FILE"];
  const prevEnvThreshold = process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  process.env["COST_ALERT_CONFIG_FILE"] = configFile;
  delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  const { _resetCostAlertConfigCache } = await import(
    "../src/lib/costAlertConfig.ts"
  );
  _resetCostAlertConfigCache();
  try {
    // Initially, no env, no file → null threshold.
    const get = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    assert.equal(get.status, 200);
    const initial = (await get.json()) as { thresholdUsd: number | null };
    assert.equal(initial.thresholdUsd, null);

    // PATCH a positive threshold.
    const patch = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ thresholdUsd: 7.5 }),
    });
    assert.equal(patch.status, 200);
    const updated = (await patch.json()) as { thresholdUsd: number | null };
    assert.equal(updated.thresholdUsd, 7.5);

    // Confirm persistence to disk.
    const onDisk = JSON.parse(await fs.readFile(configFile, "utf8")) as {
      thresholdUsd: number | null;
    };
    assert.equal(onDisk.thresholdUsd, 7.5);

    // Re-GET reads the persisted value.
    const get2 = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      headers: { Authorization: "Bearer admin-secret" },
    });
    const after = (await get2.json()) as { thresholdUsd: number | null };
    assert.equal(after.thresholdUsd, 7.5);

    // PATCH null disables.
    const off = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ thresholdUsd: null }),
    });
    assert.equal(off.status, 200);
    const offBody = (await off.json()) as { thresholdUsd: number | null };
    assert.equal(offBody.thresholdUsd, null);

    // Negative numbers rejected.
    const neg = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ thresholdUsd: -1 }),
    });
    assert.equal(neg.status, 400);

    // Zero rejected.
    const zero = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ thresholdUsd: 0 }),
    });
    assert.equal(zero.status, 400);

    // Non-numeric rejected.
    const nan = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ thresholdUsd: "five" }),
    });
    assert.equal(nan.status, 400);

    // Missing field rejected.
    const empty = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(empty.status, 400);

    // Auth required.
    const unauth = await fetch(`${baseUrl}/api/admin/cost-alert/config`);
    assert.equal(unauth.status, 401);
    const unauthPatch = await fetch(`${baseUrl}/api/admin/cost-alert/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thresholdUsd: 1 }),
    });
    assert.equal(unauthPatch.status, 401);
  } finally {
    if (prevFile === undefined) delete process.env["COST_ALERT_CONFIG_FILE"];
    else process.env["COST_ALERT_CONFIG_FILE"] = prevFile;
    if (prevEnvThreshold === undefined)
      delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
    else process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = prevEnvThreshold;
    _resetCostAlertConfigCache();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("checkAndSendCostAlert reads threshold from persisted config when env is unset", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cost-alert-config-"));
  const configFile = path.join(tmp, "config.json");
  await fs.writeFile(configFile, JSON.stringify({ thresholdUsd: 2 }));
  const prevFile = process.env["COST_ALERT_CONFIG_FILE"];
  const prevEnvThreshold = process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  process.env["COST_ALERT_CONFIG_FILE"] = configFile;
  delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
  const { _resetCostAlertConfigCache } = await import(
    "../src/lib/costAlertConfig.ts"
  );
  _resetCostAlertConfigCache();
  const { checkAndSendCostAlert } = await import("../src/lib/costAlert.ts");
  try {
    let sent = false;
    const result = await checkAndSendCostAlert({
      // No thresholdUsd override → must fall back to persisted config (2 USD).
      usageProvider: async () => ({
        day: "2026-04-19",
        requests: 10,
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
        estimatedCostUsd: 1, // below 2
      }),
      send: async () => {
        sent = true;
      },
      force: true,
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.thresholdUsd, 2);
    assert.equal(sent, false);
  } finally {
    if (prevFile === undefined) delete process.env["COST_ALERT_CONFIG_FILE"];
    else process.env["COST_ALERT_CONFIG_FILE"] = prevFile;
    if (prevEnvThreshold === undefined)
      delete process.env["COST_ALERT_DAILY_USD_THRESHOLD"];
    else process.env["COST_ALERT_DAILY_USD_THRESHOLD"] = prevEnvThreshold;
    _resetCostAlertConfigCache();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("rejects /admin/demo-events without a token", async () => {
  const res = await fetch(`${baseUrl}/api/admin/demo-events`);
  assert.equal(res.status, 401);
});

test("returns demo-events summary grouped by demo with a valid token", async () => {
  // Six raw rows across the three allow-listed demos. The route should pivot
  // them into one bucket per demo, sum totals, and order demos by total desc.
  stubExecuteSequence([
    [
      { demo: "ticketing", event: "ticket_created", count: 7 },
      { demo: "ticketing", event: "first_interaction", count: 3 },
      { demo: "ticketing", event: "export_clicked", count: 2 },
      { demo: "erp", event: "stock_adjusted", count: 4 },
      { demo: "erp", event: "invoice_generated", count: 1 },
      { demo: "bi", event: "range_changed", count: 5 },
    ],
  ]);
  try {
    const res = await fetch(
      `${baseUrl}/api/admin/demo-events?windowDays=14`,
      { headers: { Authorization: "Bearer admin-secret" } },
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      windowDays: number;
      periodStart: string;
      periodEnd: string;
      byDemo: { demo: string; total: number; events: Record<string, number> }[];
    };
    assert.equal(json.windowDays, 14);
    assert.ok(json.periodStart && json.periodEnd);
    // Three demos, sorted by total desc: ticketing (12) > bi (5) > erp (5).
    // ticketing must come first; the tie between bi and erp is allowed in
    // either order since the spec only guarantees "by total desc".
    assert.equal(json.byDemo.length, 3);
    assert.equal(json.byDemo[0].demo, "ticketing");
    assert.equal(json.byDemo[0].total, 12);
    assert.equal(json.byDemo[0].events.ticket_created, 7);
    assert.equal(json.byDemo[0].events.first_interaction, 3);
    assert.equal(json.byDemo[0].events.export_clicked, 2);
    const erp = json.byDemo.find((d) => d.demo === "erp");
    assert.ok(erp);
    assert.equal(erp.total, 5);
    assert.equal(erp.events.stock_adjusted, 4);
    assert.equal(erp.events.invoice_generated, 1);
    const bi = json.byDemo.find((d) => d.demo === "bi");
    assert.ok(bi);
    assert.equal(bi.total, 5);
    assert.equal(bi.events.range_changed, 5);
  } finally {
    restoreDb();
  }
});

test("clamps demo-events windowDays into the [1, 90] range", async () => {
  stubExecuteSequence([[]]);
  try {
    const res = await fetch(
      `${baseUrl}/api/admin/demo-events?windowDays=500`,
      { headers: { Authorization: "Bearer admin-secret" } },
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as { windowDays: number };
    assert.equal(json.windowDays, 90);
  } finally {
    restoreDb();
  }
});

test("returns 503 when ADMIN_TOKEN is not configured", async () => {
  const original = process.env["ADMIN_TOKEN"];
  delete process.env["ADMIN_TOKEN"];
  try {
    const res = await fetch(`${baseUrl}/api/admin/usage`, {
      headers: { Authorization: "Bearer anything" },
    });
    assert.equal(res.status, 503);
    const json = (await res.json()) as { error?: string };
    assert.match(json.error ?? "", /not configured/i);
  } finally {
    if (original !== undefined) process.env["ADMIN_TOKEN"] = original;
  }
});
