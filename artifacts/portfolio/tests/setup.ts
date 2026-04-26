import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Cleanup React Testing Library after each test
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement these methods that Radix UI relies on. Without
// these polyfills, Radix Select, Dropdown, and Popover components throw
// when their pointer interactions fire.
if (typeof Element !== "undefined") {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
  if (!Element.prototype.hasPointerCapture) {
    // @ts-expect-error - polyfill for Radix
    Element.prototype.hasPointerCapture = vi.fn(() => false);
  }
  if (!Element.prototype.releasePointerCapture) {
    // @ts-expect-error - polyfill for Radix
    Element.prototype.releasePointerCapture = vi.fn();
  }
  if (!Element.prototype.setPointerCapture) {
    // @ts-expect-error - polyfill for Radix
    Element.prototype.setPointerCapture = vi.fn();
  }
}

// jsdom does not implement matchMedia
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// jsdom does not implement ResizeObserver, which recharts and Radix use.
if (typeof globalThis.ResizeObserver === "undefined") {
  // @ts-expect-error - polyfill
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// URL.createObjectURL / revokeObjectURL are used by CSV export flows.
if (typeof URL.createObjectURL === "undefined") {
  // @ts-expect-error - polyfill for jsdom
  URL.createObjectURL = vi.fn(() => "blob:mock");
}
if (typeof URL.revokeObjectURL === "undefined") {
  // @ts-expect-error - polyfill for jsdom
  URL.revokeObjectURL = vi.fn();
}
