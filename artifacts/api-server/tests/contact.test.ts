import { test, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";
process.env["AGENTMAIL_API_KEY"] = "test-key";
// Force the rate limiter into in-memory mode for this test suite — the fake
// DATABASE_URL above is unreachable, so the durable backend would error on
// every request. Production routes still default to the durable backend.
process.env["RATE_LIMIT_BACKEND"] = "memory";

const originalConsoleError = console.error;
const originalConsoleLog = console.log;
console.error = () => {};
console.log = () => {};

const { default: app } = await import("../src/app.ts");
const { _resetContactRateLimit } = await import("../src/routes/contact.ts");

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
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  // The reset is async (the durable backend issues a DELETE). Even though
  // this suite uses the in-memory backend today, awaiting it keeps the test
  // hook deterministic if the backend changes.
  await _resetContactRateLimit();
});

function postContact(body: unknown): Promise<Response> {
  return realFetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("accepts a valid submission and forwards to AgentMail", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  setFetch(
    mock.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as unknown as typeof fetch,
  );

  const res = await postContact({
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines",
    message: "Hello there.",
  });
  assert.equal(res.status, 200);
  const json = (await res.json()) as { success?: boolean };
  assert.equal(json.success, true);

  assert.equal(calls.length, 1);
  const sent = calls[0]!;
  assert.match(sent.url, /agentmail\.to.*messages\/send/);
  assert.equal((sent.init?.headers as Record<string, string>)["Authorization"],
    "Bearer test-key");
  const payload = JSON.parse(String(sent.init?.body)) as {
    to: string;
    subject: string;
    text: string;
    reply_to: string;
  };
  assert.equal(payload.reply_to, "ada@example.com");
  assert.match(payload.subject, /Ada Lovelace/);
  assert.match(payload.subject, /Analytical Engines/);
  assert.match(payload.text, /Message:/);
  assert.match(payload.text, /Hello there\./);
});

test("rejects an invalid payload (missing fields) without calling AgentMail", async () => {
  let called = false;
  setFetch(
    mock.fn(async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
  );

  const res = await postContact({ name: "Only Name" });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { error?: string };
  assert.match(json.error ?? "", /required/i);
  assert.equal(called, false, "AgentMail should not be called for invalid payload");
});

test("returns 502 when AgentMail rejects the send", async () => {
  setFetch(
    mock.fn(async () =>
      new Response("upstream boom", { status: 500 }),
    ) as unknown as typeof fetch,
  );
  const res = await postContact({
    name: "Ada",
    email: "ada@example.com",
    message: "hi",
  });
  assert.equal(res.status, 502);
  const json = (await res.json()) as { error?: string };
  assert.match(json.error ?? "", /Failed to send/i);
});

test("spoofed x-forwarded-for cannot bypass the rate limit", async () => {
  setFetch(
    mock.fn(async () =>
      new Response(JSON.stringify({ id: "ok" }), { status: 200 }),
    ) as unknown as typeof fetch,
  );

  const body = { name: "Ada", email: "ada@example.com", message: "hi" };

  // Burn through the limit using the real connection (loopback IP).
  for (let i = 0; i < 5; i += 1) {
    const ok = await realFetch(`${baseUrl}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(ok.status, 200);
  }

  // Now try to bypass by claiming a different IP via x-forwarded-for.
  // Trust proxy is NOT enabled, so Express must ignore XFF and the
  // limiter should still see the same socket-derived key -> 429.
  const spoofed = await realFetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "9.9.9.9",
    },
    body: JSON.stringify(body),
  });
  assert.equal(spoofed.status, 429, "spoofed XFF must not bypass the limit");
});

test("rate-limits repeated submissions from the same IP", async () => {
  setFetch(
    mock.fn(async () =>
      new Response(JSON.stringify({ id: "ok" }), { status: 200 }),
    ) as unknown as typeof fetch,
  );

  const body = {
    name: "Ada",
    email: "ada@example.com",
    message: "hi",
  };

  // The limiter allows 5; the 6th must come back as 429.
  for (let i = 0; i < 5; i += 1) {
    const ok = await postContact(body);
    assert.equal(ok.status, 200, `request ${i + 1} should be allowed`);
  }
  const limited = await postContact(body);
  assert.equal(limited.status, 429);
  const json = (await limited.json()) as { error?: string };
  assert.match(json.error ?? "", /too many/i);
});
