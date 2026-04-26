import { test } from "node:test";
import assert from "node:assert/strict";
import { SseChatParser } from "../src/lib/sseParser.ts";

function chunk(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

test("parses a simple data line", () => {
  const p = new SseChatParser();
  const events = p.push(
    chunk(`data: {"choices":[{"delta":{"content":"hi"}}]}\n`),
  );
  assert.deepEqual(events, [{ content: "hi" }]);
});

test("ignores the [DONE] sentinel", () => {
  const p = new SseChatParser();
  const events = p.push(chunk(`data: [DONE]\n`));
  assert.deepEqual(events, []);
});

test("buffers JSON split across chunks", () => {
  const p = new SseChatParser();
  // Split a single JSON payload mid-string across three pushes.
  const out: ReturnType<SseChatParser["push"]> = [];
  out.push(...p.push(chunk(`data: {"choices":[{"delt`)));
  out.push(...p.push(chunk(`a":{"content":"hello "}}`)));
  out.push(...p.push(chunk(`]}\n`)));
  assert.deepEqual(out, [{ content: "hello " }]);
});

test("handles multiple events arriving in one chunk", () => {
  const p = new SseChatParser();
  const events = p.push(
    chunk(
      `data: {"choices":[{"delta":{"content":"a"}}]}\n` +
        `data: {"choices":[{"delta":{"content":"b"}}]}\n` +
        `data: [DONE]\n`,
    ),
  );
  assert.deepEqual(events, [{ content: "a" }, { content: "b" }]);
});

test("captures usage metrics", () => {
  const p = new SseChatParser();
  const events = p.push(
    chunk(
      `data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n`,
    ),
  );
  assert.deepEqual(events, [
    { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
  ]);
});

test("ignores malformed JSON without throwing", () => {
  const p = new SseChatParser();
  const events = p.push(
    chunk(
      `data: {not json}\n` +
        `data: {"choices":[{"delta":{"content":"ok"}}]}\n`,
    ),
  );
  assert.deepEqual(events, [{ content: "ok" }]);
});

test("ignores non-data lines (comments, blank lines)", () => {
  const p = new SseChatParser();
  const events = p.push(
    chunk(
      `: keepalive\n` +
        `\n` +
        `event: message\n` +
        `data: {"choices":[{"delta":{"content":"x"}}]}\n`,
    ),
  );
  assert.deepEqual(events, [{ content: "x" }]);
});

test("does not emit until the line is terminated by newline", () => {
  const p = new SseChatParser();
  const partial = p.push(
    chunk(`data: {"choices":[{"delta":{"content":"partial"}}]}`),
  );
  assert.deepEqual(partial, []);
  const finished = p.push(chunk(`\n`));
  assert.deepEqual(finished, [{ content: "partial" }]);
});
