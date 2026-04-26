import { test } from "node:test";
import assert from "node:assert/strict";
import { SseChatParser } from "../src/lib/sseParser.ts";

function chunk(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

test("surfaces a tool-call name + arguments delta", () => {
  const p = new SseChatParser();
  const events = p.push(
    chunk(
      `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"book_meeting","arguments":"{\\"name\\":"}}]}}]}\n`,
    ),
  );
  assert.equal(events.length, 1);
  const evt = events[0]!;
  assert.ok(evt.toolCalls);
  assert.equal(evt.toolCalls!.length, 1);
  assert.equal(evt.toolCalls![0]!.name, "book_meeting");
  assert.equal(evt.toolCalls![0]!.id, "call_1");
  assert.equal(evt.toolCalls![0]!.argumentsDelta, '{"name":');
});

test("captures finish_reason=tool_calls", () => {
  const p = new SseChatParser();
  const events = p.push(
    chunk(`data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n`),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]!.finishReason, "tool_calls");
});

test("accumulates a multi-chunk tool-call argument stream", () => {
  // Simulate what the chat route does: concatenate `argumentsDelta` slices
  // by tool index until finish_reason fires, then JSON.parse the result.
  const p = new SseChatParser();
  const out: string[] = [];
  let finish: string | null = null;
  const chunks = [
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"send_brief","arguments":"{\\"email\\":\\"r@a.co\\","}}]}}]}\n`,
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"roleFocus\\":\\"ERP\\","}}]}}]}\n`,
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"timeline\\":\\"Q3\\"}"}}]}}]}\n`,
    `data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n`,
  ];
  for (const c of chunks) {
    for (const evt of p.push(chunk(c))) {
      if (evt.toolCalls) {
        for (const d of evt.toolCalls) if (d.argumentsDelta) out.push(d.argumentsDelta);
      }
      if (evt.finishReason) finish = evt.finishReason;
    }
  }
  assert.equal(finish, "tool_calls");
  const joined = out.join("");
  const parsed = JSON.parse(joined) as Record<string, string>;
  assert.deepEqual(parsed, {
    email: "r@a.co",
    roleFocus: "ERP",
    timeline: "Q3",
  });
});

test("plain content events still parse alongside tool-calls being introduced", () => {
  // Backwards-compat: nothing about adding toolCalls/finishReason should
  // change the behaviour for old SSE payloads.
  const p = new SseChatParser();
  const events = p.push(
    chunk(`data: {"choices":[{"delta":{"content":"hello"}}]}\n`),
  );
  assert.deepEqual(events, [{ content: "hello" }]);
});
