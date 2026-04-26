import type { DemoSlug } from "@/lib/demoTelemetry";

const DEMO_STORAGE_KEYS: Record<DemoSlug, string[]> = {
  ticketing: ["demo:ticketing:v1", "demo:ticketing-counter:v1"],
  erp: [
    "demo:erp-products:v1",
    "demo:erp-invoice-lines:v1",
    "demo:erp-customer:v1",
    "demo:erp-invoice-counter:v1",
  ],
  bi: ["demo:bi-range-days:v1"],
};

const URL_PARAM_DEMO = "demo";
const URL_PARAM_STATE = "state";

const MAX_STATE_BYTES = 8_000;

interface SharedPayload {
  d: DemoSlug;
  s: Record<string, string>;
}

export function collectDemoState(slug: DemoSlug): Record<string, string> | null {
  const keys = DEMO_STORAGE_KEYS[slug];
  if (!keys) return null;
  const map: Record<string, string> = {};
  let hasAny = false;
  for (const key of keys) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      map[key] = val;
      hasAny = true;
    }
  }
  return hasAny ? map : null;
}

export function hasLocalDemoState(slug: DemoSlug): boolean {
  const keys = DEMO_STORAGE_KEYS[slug];
  if (!keys) return false;
  return keys.some((k) => localStorage.getItem(k) !== null);
}

export function applySharedState(slug: DemoSlug, stateMap: Record<string, string>): void {
  const keys = DEMO_STORAGE_KEYS[slug];
  if (!keys) return;
  for (const key of keys) {
    if (key in stateMap) {
      localStorage.setItem(key, stateMap[key]);
    } else {
      localStorage.removeItem(key);
    }
  }
}

export function encodeDemoState(slug: DemoSlug): string | null {
  const stateMap = collectDemoState(slug);
  if (!stateMap) return null;

  const payload: SharedPayload = { d: slug, s: stateMap };
  const json = JSON.stringify(payload);
  const encoded = btoa(unescape(encodeURIComponent(json)));

  if (encoded.length > MAX_STATE_BYTES) {
    return null;
  }
  return encoded;
}

export interface DecodedShareLink {
  slug: DemoSlug;
  stateMap: Record<string, string>;
}

export function decodeDemoState(encoded: string): DecodedShareLink | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    const payload = JSON.parse(json) as SharedPayload;

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.d !== "string" ||
      typeof payload.s !== "object" ||
      !DEMO_STORAGE_KEYS[payload.d as DemoSlug]
    ) {
      return null;
    }

    return { slug: payload.d as DemoSlug, stateMap: payload.s };
  } catch {
    return null;
  }
}

export function buildShareUrl(slug: DemoSlug): string | null {
  const encoded = encodeDemoState(slug);
  if (!encoded) return null;

  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM_DEMO, slug);
  url.searchParams.set(URL_PARAM_STATE, encoded);
  url.hash = "live-demos";
  return url.toString();
}

export function readShareFromUrl(): DecodedShareLink | null {
  const params = new URLSearchParams(window.location.search);
  const demo = params.get(URL_PARAM_DEMO);
  const state = params.get(URL_PARAM_STATE);
  if (!demo || !state) return null;
  return decodeDemoState(state);
}

export function clearShareParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_PARAM_DEMO);
  url.searchParams.delete(URL_PARAM_STATE);
  window.history.replaceState({}, "", url.toString());
}
