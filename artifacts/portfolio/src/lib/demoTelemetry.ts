// Privacy-respecting telemetry for the Live Capability Demos.
//
// Each demo emits a small number of structured event names. The payload
// only contains the demo slug + event name — no visitor identity, no DOM
// state, no question text. Requests are best-effort: failures are
// swallowed so a flaky network or blocked endpoint never breaks the demo.
//
// Tests run without a window/document, so we guard every browser API.

export type DemoSlug = "ticketing" | "erp" | "bi";

export type DemoEventName =
  | "first_interaction"
  | "ticket_created"
  | "stock_adjusted"
  | "range_changed"
  | "export_clicked"
  | "project_link_clicked"
  | "invoice_generated";

const TRACKING_OPT_OUT_KEY = "demo-tracking-opt-out";

type OptOutListener = (optedOut: boolean) => void;
const listeners = new Set<OptOutListener>();

function browserDoNotTrack(): boolean {
  if (typeof navigator === "undefined") return false;
  const dnt =
    (navigator as { doNotTrack?: string }).doNotTrack ??
    (typeof window !== "undefined"
      ? (window as { doNotTrack?: string }).doNotTrack
      : undefined);
  return dnt === "1";
}

export function isDemoTrackingOptedOut(): boolean {
  if (browserDoNotTrack()) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TRACKING_OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoTrackingOptOut(optOut: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (optOut) {
      window.localStorage.setItem(TRACKING_OPT_OUT_KEY, "1");
    } else {
      window.localStorage.removeItem(TRACKING_OPT_OUT_KEY);
    }
  } catch {
    // localStorage may be unavailable (private browsing, quota, etc.)
  }
  const effective = isDemoTrackingOptedOut();
  listeners.forEach((fn) => fn(effective));
}

export function onOptOutChange(fn: OptOutListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getApiUrl(): string | null {
  if (typeof window === "undefined") return null;
  const base =
    typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
      ? String(import.meta.env.BASE_URL).replace(/\/$/, "")
      : "";
  return `${base}/../api/demo-events`;
}

export function trackDemoEvent(demo: DemoSlug, event: DemoEventName): void {
  if (isDemoTrackingOptedOut()) return;

  const url = getApiUrl();
  if (!url) return;

  const payload = JSON.stringify({ demo, event });

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
  } catch {
    // Fall through to fetch.
  }

  if (typeof fetch === "function") {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Telemetry must never surface to the user.
    });
  }
}

/**
 * Returns a stable callback that fires `first_interaction` for the given
 * demo at most once per page load. Safe to invoke from inside React
 * handlers — the underlying state lives in module scope so re-renders
 * don't reset it.
 */
const firstInteractionFired = new Set<DemoSlug>();
export function trackFirstInteraction(demo: DemoSlug): void {
  if (firstInteractionFired.has(demo)) return;
  firstInteractionFired.add(demo);
  trackDemoEvent(demo, "first_interaction");
}

// Test-only escape hatch so unit tests can reset module state between
// cases. Kept underscored to signal "not part of the public API".
export function _resetDemoTelemetryForTests(): void {
  firstInteractionFired.clear();
  listeners.clear();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(TRACKING_OPT_OUT_KEY);
    } catch {
      // noop
    }
  }
}
