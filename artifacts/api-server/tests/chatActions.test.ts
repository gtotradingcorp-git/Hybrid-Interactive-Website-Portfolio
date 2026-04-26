import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";
process.env["AGENTMAIL_API_KEY"] = "test-key";

const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
console.error = () => {};
console.log = () => {};
console.warn = () => {};

// Note: db inserts in chatActions are wrapped in try/catch — if the test
// DATABASE_URL is unreachable, logAction returns null and hot_leads insert
// is silently swallowed. The action endpoints still complete and return
// the validation/email response we assert on.
const { default: app } = await import("../src/app.ts");
const { _resetChatRateLimit } = await import("../src/routes/chat.ts");

const realFetch: typeof fetch = globalThis.fetch.bind(globalThis);
function setFetch(impl: typeof fetch): void {
  (globalThis as { fetch: typeof fetch }).fetch = impl;
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
  setFetch(realFetch);
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  await _resetChatRateLimit();
});

function postAction(tool: string, body: unknown): Promise<Response> {
  return realFetch(`${baseUrl}/api/chat/actions/${tool}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("alert_john rejects missing fields", async () => {
  const res = await postAction("alert_john", { arguments: { email: "x@y.co" } });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { ok?: boolean };
  assert.equal(json.ok, false);
});

test("alert_john rejects invalid email", async () => {
  setFetch(mock.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch);
  const res = await postAction("alert_john", {
    arguments: { email: "not-an-email", company: "Acme", role: "CTO" },
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { ok?: boolean; message?: string };
  assert.equal(json.ok, false);
  assert.match(json.message ?? "", /invalid/i);
});

test("alert_john sends to AgentMail and returns ok", async () => {
  let captured: { url: string; body: unknown } | null = null;
  setFetch(
    mock.fn(async (url: string, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as unknown as typeof fetch,
  );
  const res = await postAction("alert_john", {
    arguments: {
      email: "alex@acme.co",
      company: "Acme",
      role: "Head of Eng",
      note: "We have a 90-day window.",
    },
    transcript: "user: we'd love to chat",
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { ok?: boolean };
  assert.equal(json.ok, true);
  assert.ok(captured);
  assert.match((captured as { url: string }).url, /agentmail\.to.*messages\/send/);
  const sent = (captured as { body: { to: string; subject: string; reply_to?: string } }).body;
  assert.match(sent.subject, /Hot Lead.*Acme/);
  assert.equal(sent.reply_to, "alex@acme.co");
});

test("share_with_panel rejects >3 panel emails", async () => {
  const res = await postAction("share_with_panel", {
    arguments: {
      panelEmails: ["a@x.co", "b@x.co", "c@x.co", "d@x.co"],
      senderEmail: "me@me.co",
      roleFocus: "ERP",
    },
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { ok?: boolean; message?: string };
  assert.equal(json.ok, false);
  assert.match(json.message ?? "", /up to 3/i);
});

test("rate-limits action endpoints per IP after 5 requests/min", async () => {
  setFetch(
    mock.fn(async () => new Response(JSON.stringify({ id: "ok" }), { status: 200 })) as unknown as typeof fetch,
  );
  // 5 successful requests, 6th should be 429.
  for (let i = 0; i < 5; i++) {
    const res = await postAction("alert_john", {
      arguments: { email: `r${i}@x.co`, company: "Acme", role: "VP" },
    });
    assert.equal(res.status, 200);
  }
  const blocked = await postAction("alert_john", {
    arguments: { email: "r6@x.co", company: "Acme", role: "VP" },
  });
  assert.equal(blocked.status, 429);
});
