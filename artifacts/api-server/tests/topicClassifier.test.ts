import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = "https://fake.test/v1";
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = "test-key";

const {
  classifyTopicWithAI,
  _resetTopicCache,
  _topicCacheStats,
} = await import("../src/lib/topicClassifier.ts");

const realFetch = globalThis.fetch;

interface FetchCall {
  url: string;
  body: unknown;
}

function installFakeFetch(reply: string): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: reply } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  return { calls };
}

beforeEach(() => {
  _resetTopicCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("repeat questions reuse the cached label and skip the classifier call", async () => {
  const { calls } = installFakeFetch("contact");
  const a = await classifyTopicWithAI("How do I contact you?");
  const b = await classifyTopicWithAI("How do I contact you?");
  assert.equal(a, "contact");
  assert.equal(b, "contact");
  assert.equal(calls.length, 1, "second identical call must hit the cache");
  const stats = _topicCacheStats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.equal(stats.size, 1);
});

test("normalization treats punctuation/case/whitespace variations as the same key", async () => {
  const { calls } = installFakeFetch("projects");
  await classifyTopicWithAI("What projects have you done?");
  await classifyTopicWithAI("WHAT  projects, have you done???");
  await classifyTopicWithAI("  what projects have you done  ");
  assert.equal(calls.length, 1, "all three phrasings must collapse to one cache key");
});

test("different questions trigger separate classifier calls", async () => {
  const { calls } = installFakeFetch("projects");
  await classifyTopicWithAI("Tell me about your career history.");
  await classifyTopicWithAI("What projects have you delivered?");
  assert.equal(calls.length, 2);
  const stats = _topicCacheStats();
  assert.equal(stats.size, 2);
});

test("unrecognized model output is NOT cached (so the next call retries)", async () => {
  const { calls } = installFakeFetch("nonsense_label");
  const a = await classifyTopicWithAI("This question is fine and asks about projects.");
  const b = await classifyTopicWithAI("This question is fine and asks about projects.");
  // Both calls should reach the upstream because the malformed reply isn't cached.
  assert.equal(calls.length, 2);
  // Both should still return a topic via the keyword fallback.
  assert.equal(typeof a, "string");
  assert.equal(typeof b, "string");
});

test("upstream failures are NOT cached (so a transient outage doesn't pin a stale label)", async () => {
  let count = 0;
  globalThis.fetch = (async () => {
    count += 1;
    return new Response("boom", { status: 500 });
  }) as typeof fetch;
  await classifyTopicWithAI("How do I contact you?");
  await classifyTopicWithAI("How do I contact you?");
  assert.equal(count, 2, "failed classifier call must not be cached");
});

test("LRU eviction keeps the cache bounded under heavy load", async () => {
  installFakeFetch("other");
  // 600 unique questions should evict the oldest entries down to the 500-entry cap.
  for (let i = 0; i < 600; i++) {
    await classifyTopicWithAI(`unique question number ${i} about something`);
  }
  const stats = _topicCacheStats();
  assert.ok(stats.size <= 500, `cache size ${stats.size} exceeded cap of 500`);
});

test("recently-accessed entries are kept; the true least-recently-used entry is evicted", async () => {
  // Cache cap is 500. Fill it, then re-access entry 0 (oldest by insertion)
  // to mark it most-recently-used. Inserting one more entry should then evict
  // entry 1 (which is now the oldest), NOT entry 0.
  installFakeFetch("other");
  for (let i = 0; i < 500; i++) {
    await classifyTopicWithAI(`lru entry ${i}`);
  }
  // Touch entry 0 — should bump it to MRU. This is a cache hit, no fetch.
  await classifyTopicWithAI("lru entry 0");
  // Insert one new entry to push the cache one past the cap.
  await classifyTopicWithAI("lru new entry 999");

  const beforeStats = _topicCacheStats();
  assert.equal(beforeStats.size, 500);

  // Re-asking entry 0 should be a cache hit (no new fetch).
  const before = beforeStats.hits;
  await classifyTopicWithAI("lru entry 0");
  const after = _topicCacheStats();
  assert.equal(after.hits, before + 1, "entry 0 should still be cached after eviction");

  // Re-asking entry 1 (the true LRU) should be a cache MISS — it was evicted,
  // so the classifier is called again.
  const missesBefore = after.misses;
  await classifyTopicWithAI("lru entry 1");
  const final = _topicCacheStats();
  assert.equal(final.misses, missesBefore + 1, "entry 1 should have been evicted as LRU");
});

test("entries expire after the TTL and are refreshed on next call", async () => {
  const realNow = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  try {
    const { calls } = installFakeFetch("contact");
    await classifyTopicWithAI("How do I contact you?");
    // Advance 30 minutes — still within the 1 hour TTL, must hit cache.
    now += 30 * 60 * 1000;
    await classifyTopicWithAI("How do I contact you?");
    assert.equal(calls.length, 1, "within TTL the classifier must not be called again");
    // Advance past the 1-hour TTL.
    now += 31 * 60 * 1000;
    await classifyTopicWithAI("How do I contact you?");
    assert.equal(calls.length, 2, "past TTL the classifier must be called again to refresh");
  } finally {
    Date.now = realNow;
  }
});
