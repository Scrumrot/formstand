// The dev-build test the library consults before emitting a console
// warning. Bundlers that define NODE_ENV fold it to a constant and drop the
// dev-only branches; the `typeof process` guard keeps the SAME expression
// from throwing in a runtime that defines no `process` at all (a CDN/ESM
// consumer, a test runner without the define). That last case matters most
// on the submit path: handleSubmit promises never to reject, and the
// warning that fires only when a save failed was the one line that could
// break the promise exactly on the failure path. It FAILS OPEN on purpose:
// an unknowable environment gets the warnings, which cost nothing but a
// console line.
export const isDevBuild = (): boolean =>
  typeof process === "undefined" ||
  process.env?.["NODE_ENV"] !== "production";

// The gate for the two sites that EXPOSE form state: the FormstandDevtools
// panel (renders every value and error into the page) and the zustand
// devtools middleware (streams every write to the Redux extension). These
// must FAIL CLOSED: isDevBuild's "no process means dev" reading let a
// CDN/ESM, Deno, or worker production build mount the panel and keep the
// middleware live for any end user with the extension installed. Only a
// readable NODE_ENV that is a string other than "production" counts as
// development; no process, no env, or an unset NODE_ENV all read as
// production here.
export const isDevToolsBuild = (): boolean => {
  if (typeof process === "undefined") return false;
  const env = process.env?.["NODE_ENV"];
  return typeof env === "string" && env !== "production";
};
