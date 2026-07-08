import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest.config.ts sets `globals: false`, which disables Testing Library's
// own auto-cleanup (it registers via a global afterEach). Do it here once so
// every react test unmounts between cases instead of leaking trees and
// subscriptions.
afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver; Radix primitives (Slider's thumb sizing)
// observe elements on mount, so the shadcn smoke-test tabs need a stand-in.
// Layout never changes in jsdom, so an observer that never fires is
// accurate. A `new`-able function (constructors ignore `this` when the body
// returns an object) keeps the codebase class-free.
globalThis.ResizeObserver ??= function ResizeObserver(): ResizeObserver {
  return { observe: () => {}, unobserve: () => {}, disconnect: () => {} };
} as unknown as typeof ResizeObserver;
