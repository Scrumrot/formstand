// The one dev-build test the library consults before emitting a console
// warning or mounting the devtools panel. Bundlers that define NODE_ENV
// fold it to a constant and drop the dev-only branches; the `typeof process`
// guard keeps the SAME expression from throwing in a runtime that defines
// no `process` at all (a CDN/ESM consumer, a test runner without the define).
// That last case matters most on the submit path: handleSubmit promises
// never to reject, and the warning that fires only when a save failed was
// the one line that could break the promise exactly on the failure path.
export const isDevBuild = (): boolean =>
  typeof process === "undefined" ||
  process.env?.["NODE_ENV"] !== "production";
