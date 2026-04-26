import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Configure environment BEFORE importing the app so module-load-time reads see
// these values. We use the integrations proxy variables to satisfy the route's
// credential check, and a fake DATABASE_URL that's parseable but unreachable
// (the chat-logs insert is fire-and-forget with .catch(), so a connection
// failure does not affect the response).
process.env["DATABASE_URL"] =
  process.env["DATABASE_URL"] ??
  "postgres://user:pass@127.0.0.1:1/fake_db_for_tests";
process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = "https://fake.test/v1";
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = "test-key";
// Keep the upstream timeout small so the stalled-upstream test runs quickly.
process.env["CHAT_UPSTREAM_TIMEOUT_MS"] = "300";
// Force the rate limiter into in-memory mode for this test suite — the fake
// DATABASE_URL above is unreachable, so the durable backend would error on
// every request. Production routes still default to the durable backend.
process.env["RATE_LIMIT_BACKEND"] = "memory";

// Suppress noisy stderr from the route's console.error / console.warn paths
// during expected error scenarios.
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;
console.error = () => {};
console.warn = () => {};
console.log = () => {};

const { default: app } = await import("../src/app.ts");

// Each test installs its own fetch mock; the helper resets between tests.
// `realFetch` is captured BEFORE any test overrides `globalThis.fetch` and is
// what the test client uses to talk to the server under test — otherwise the
// mock we install for the route would also intercept the test's own request.
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
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(chunks[i]!));
      i += 1;
    },
  });
}

async function readAllSse(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

function parseSseEvents(raw: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    try {
      events.push(JSON.parse(payload) as Record<string, unknown>);
    } catch {
      // ignore
    }
  }
  return events;
}

test("streams a successful chat response with usage metrics", async () => {
  setFetch(
    mock.fn(async () => {
      return new Response(
        sseStream([
          `data: {"choices":[{"delta":{"content":"Hello "}}]}\n`,
          `data: {"choices":[{"delta":{"content":"world"}}]}\n`,
          `data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n`,
          `data: [DONE]\n`,
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as unknown as typeof fetch,
  );

  const res = await realFetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

  const raw = await readAllSse(res);
  const events = parseSseEvents(raw);
  const contentEvents = events.filter((e) => "content" in e);
  const doneEvents = events.filter((e) => "done" in e);
  assert.deepEqual(
    contentEvents.map((e) => e["content"]).join(""),
    "Hello world",
  );
  assert.equal(doneEvents.length, 1);
});

test("aborts and surfaces a friendly SSE error when the upstream stalls", async (t) => {
  setFetch(
    mock.fn(async (_url: string, init?: RequestInit) => {
      // Headers arrive immediately, but the body never produces any tokens
      // until the route's AbortController fires, at which point we close so
      // the read loop in the route unblocks and falls into the catch branch.
      const signal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (signal) {
            signal.addEventListener("abort", () => {
              try {
                controller.error(new DOMException("aborted", "AbortError"));
              } catch {
                // ignore
              }
            });
          }
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as unknown as typeof fetch,
  );

  const start = Date.now();
  const res = await realFetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  // The route flushes SSE headers before calling the upstream, so a stall
  // surfaces as a 200 response whose body contains a single SSE `error`
  // event with the friendly timeout copy. (The 500/504 JSON paths in the
  // catch block only fire when headers haven't been sent yet — which can't
  // happen here.) Either way, the response must complete within a small
  // multiple of the upstream timeout (300ms) — never hang.
  const raw = await readAllSse(res);
  const elapsed = Date.now() - start;
  assert.ok(
    elapsed < 5_000,
    `chat response took ${elapsed}ms — should have aborted on stall`,
  );
  const events = parseSseEvents(raw);
  const errEvent = events.find((e) => "error" in e);
  assert.ok(errEvent, "expected an error SSE event after stall");
  assert.match(
    String(errEvent!["error"]),
    /longer than expected|try again/i,
    "client message should be the friendly timeout copy",
  );
  t.diagnostic(`stalled-upstream completed in ${elapsed}ms`);
});

test("client disconnect aborts upstream and does not crash the server", async () => {
  let upstreamAborted = false;
  setFetch(
    mock.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      // Resolve a streaming Response that never ends; observe the abort
      // signal so we can assert the route propagated the disconnect.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          // Emit one chunk so the client side has something to read.
          controller.enqueue(
            new TextEncoder().encode(
              `data: {"choices":[{"delta":{"content":"x"}}]}\n`,
            ),
          );
          if (signal) {
            signal.addEventListener("abort", () => {
              upstreamAborted = true;
              try {
                controller.close();
              } catch {
                // ignore
              }
            });
          }
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch,
  );

  const ac = new AbortController();
  const promise = realFetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    signal: ac.signal,
  })
    .then(async (res) => {
      // Read one byte then disconnect.
      const reader = res.body!.getReader();
      await reader.read();
      ac.abort();
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    })
    .catch(() => {
      // The aborted fetch will reject; that's expected.
    });

  await promise;
  // Give the server a tick to observe the close event and abort the upstream.
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(
    upstreamAborted,
    true,
    "upstream fetch should have been aborted when the client disconnected",
  );

  // The server should still be responsive after a client disconnect.
  setFetch(
    mock.fn(async () =>
      new Response(
        sseStream([
          `data: {"choices":[{"delta":{"content":"ok"}}]}\n`,
          `data: [DONE]\n`,
        ]),
        { status: 200 },
      ),
    ) as unknown as typeof fetch,
  );
  const followUp = await realFetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "again" }] }),
  });
  assert.equal(followUp.status, 200);
  const raw = await readAllSse(followUp);
  const events = parseSseEvents(raw);
  assert.ok(
    events.some((e) => e["content"] === "ok"),
    "follow-up request should still stream content",
  );
});
