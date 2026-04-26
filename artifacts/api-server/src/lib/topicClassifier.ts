import { logger } from "./logger";

export type ChatTopic =
  | "experience"
  | "projects"
  | "capabilities"
  | "tech_stack"
  | "contact"
  | "leadership"
  | "industries"
  | "education"
  | "other";

const ALL_TOPICS: ChatTopic[] = [
  "experience",
  "projects",
  "capabilities",
  "tech_stack",
  "contact",
  "leadership",
  "industries",
  "education",
  "other",
];

interface TopicRule {
  topic: ChatTopic;
  keywords: RegExp;
}

const RULES: TopicRule[] = [
  {
    topic: "contact",
    keywords:
      /\b(contact|email|reach|hire|available|availability|rate|salary|interview|schedule|meeting|call)\b/i,
  },
  {
    topic: "projects",
    keywords:
      /\b(project|projects|portfolio|case study|case studies|built|delivered|implementation|implementations|rollout|deployment)\b/i,
  },
  {
    topic: "tech_stack",
    keywords:
      /\b(tech|stack|technology|technologies|tool|tools|framework|sap|oracle|aws|azure|gcp|cloud|kubernetes|docker|devops|database|sql|python|node|java|erp|ai|ml)\b/i,
  },
  {
    topic: "experience",
    keywords:
      /\b(experience|background|career|history|years|worked|work history|resume|cv|previous|past)\b/i,
  },
  {
    topic: "capabilities",
    keywords:
      /\b(capabilit|skill|skills|expertise|specialt|strength|competenc|what can|what does)\b/i,
  },
  {
    topic: "leadership",
    keywords:
      /\b(lead|leader|leadership|manage|management|director|team|program|strategy|transformation)\b/i,
  },
  {
    topic: "industries",
    keywords:
      /\b(industry|industries|sector|sectors|client|clients|domain|vertical|finance|banking|retail|manufacturing|healthcare|government|telecom)\b/i,
  },
  {
    topic: "education",
    keywords:
      /\b(education|degree|university|school|certif|qualification|study|studied)\b/i,
  },
];

export function classifyTopic(text: string): ChatTopic {
  if (!text) return "other";
  for (const rule of RULES) {
    if (rule.keywords.test(text)) {
      return rule.topic;
    }
  }
  return "other";
}

// Tiny model that's plenty smart for picking one of nine labels and keeps
// classification cost negligible compared with the actual chat answer.
const CLASSIFIER_MODEL = "gpt-4o-mini";
const CLASSIFIER_TIMEOUT_MS = 4000;

const TOPIC_DESCRIPTIONS: Record<Exclude<ChatTopic, "other">, string> = {
  experience: "career history, years of experience, past roles, resume",
  projects: "specific projects, portfolio pieces, case studies, deliveries, implementations",
  capabilities: "skills, expertise, specialties, strengths, what John can do",
  tech_stack: "technologies, tools, frameworks, platforms, programming languages, ERPs, cloud",
  contact: "how to contact, email, hire, availability, rates, scheduling a meeting",
  leadership: "leadership, management, team building, strategy, transformation programs",
  industries: "industries, sectors, verticals, client domains served",
  education: "education, degrees, university, certifications, qualifications",
};

const CLASSIFIER_SYSTEM_PROMPT = (() => {
  const lines = [
    "You label visitor questions about an executive's portfolio into ONE topic.",
    "Reply with ONLY the topic key, nothing else. Allowed keys:",
    ...Object.entries(TOPIC_DESCRIPTIONS).map(([k, v]) => `- ${k}: ${v}`),
    "- other: small talk, greetings, off-topic, or anything that doesn't fit above",
    "Pick the single best fit. Do not explain.",
  ];
  return lines.join("\n");
})();

interface ClassifierConfig {
  baseUrl: string;
  apiKey: string;
}

function getClassifierConfig(): ClassifierConfig | null {
  const aiBase = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const aiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (aiBase && aiKey) {
    return { baseUrl: aiBase.replace(/\/$/, ""), apiKey: aiKey };
  }
  const fallback = process.env["OPENAI_API_KEY"];
  if (fallback) {
    return { baseUrl: "https://api.openai.com/v1", apiKey: fallback };
  }
  return null;
}

function normalizeTopic(raw: string): ChatTopic | null {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z_]/g, " ")
    .trim()
    .split(/\s+/)[0];
  if (!cleaned) return null;
  if ((ALL_TOPICS as string[]).includes(cleaned)) {
    return cleaned as ChatTopic;
  }
  // Tolerate a few common variants the model might emit.
  const aliases: Record<string, ChatTopic> = {
    tech: "tech_stack",
    technology: "tech_stack",
    stack: "tech_stack",
    skill: "capabilities",
    skills: "capabilities",
    project: "projects",
    industry: "industries",
    lead: "leadership",
    manage: "leadership",
    contacts: "contact",
  };
  return aliases[cleaned] ?? null;
}

// In-memory LRU cache for AI-classified topics. Visitors frequently ask the
// same handful of questions ("what projects have you done?", "how do I
// contact you?") so even a tiny cache eliminates most repeat classifier
// calls with no accuracy loss. Bounded by both entry count and TTL so memory
// stays trivial.
const TOPIC_CACHE_MAX_ENTRIES = 500;
const TOPIC_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface TopicCacheEntry {
  topic: ChatTopic;
  expiresAt: number;
}

// Map preserves insertion order in JS, which gives us cheap LRU semantics:
// re-insert on hit to mark "most recently used", evict from the front when
// over capacity.
const topicCache = new Map<string, TopicCacheEntry>();
let topicCacheHits = 0;
let topicCacheMisses = 0;

function normalizeQuestionForCache(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    // Strip punctuation / symbols, collapse to single spaces.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function cacheGet(key: string): ChatTopic | null {
  const hit = topicCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    topicCache.delete(key);
    return null;
  }
  // Refresh LRU position.
  topicCache.delete(key);
  topicCache.set(key, hit);
  return hit.topic;
}

function cacheSet(key: string, topic: ChatTopic): void {
  if (topicCache.has(key)) topicCache.delete(key);
  topicCache.set(key, { topic, expiresAt: Date.now() + TOPIC_CACHE_TTL_MS });
  while (topicCache.size > TOPIC_CACHE_MAX_ENTRIES) {
    const oldest = topicCache.keys().next().value;
    if (oldest === undefined) break;
    topicCache.delete(oldest);
  }
}

/** Test helper: clear cache + counters between tests. Not for production use. */
export function _resetTopicCache(): void {
  topicCache.clear();
  topicCacheHits = 0;
  topicCacheMisses = 0;
}

/** Test/observability helper: snapshot of cache state. */
export function _topicCacheStats(): { size: number; hits: number; misses: number } {
  return { size: topicCache.size, hits: topicCacheHits, misses: topicCacheMisses };
}

/**
 * Ask the chat model itself to label the question. This is far more accurate
 * than the keyword matcher, especially for paraphrased or multi-keyword
 * questions. Falls back to the keyword classifier on any failure so logging
 * never breaks because of a classifier hiccup.
 *
 * Results are cached in-process by normalized question text so repeat
 * questions ("how do I contact you?") don't trigger a fresh classifier call.
 * Cache is bounded by entry count and TTL so memory stays trivial. Only
 * successful AI classifications are cached — fallback (keyword) results are
 * not cached, so a transient upstream outage doesn't pin a stale label.
 *
 * Cost is negligible: ~150 prompt tokens + ~3 completion tokens per call on
 * gpt-4o-mini, vs hundreds of tokens for the actual chat answer.
 */
export async function classifyTopicWithAI(
  text: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ChatTopic> {
  if (!text || !text.trim()) return "other";

  const cacheKey = normalizeQuestionForCache(text);
  if (cacheKey) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      topicCacheHits += 1;
      return cached;
    }
    topicCacheMisses += 1;
  }

  const config = getClassifierConfig();
  if (!config) return classifyTopic(text);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const truncated = text.slice(0, 500);
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        max_completion_tokens: 5,
        temperature: 0,
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
          { role: "user", content: truncated },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Classifier upstream ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const topic = normalizeTopic(raw);
    if (topic) {
      if (cacheKey) cacheSet(cacheKey, topic);
      return topic;
    }
    logger.warn({ raw }, "AI topic classifier returned unrecognized label, falling back");
    return classifyTopic(text);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "AI topic classifier failed, using keyword fallback");
    return classifyTopic(text);
  } finally {
    clearTimeout(timeout);
  }
}
