import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest.config.ts sets `globals: false`, which disables Testing Library's
// own auto-cleanup (it registers via a global afterEach). Do it here once so
// every react test unmounts between cases instead of leaking trees and
// subscriptions.
afterEach(() => {
  cleanup();
});
