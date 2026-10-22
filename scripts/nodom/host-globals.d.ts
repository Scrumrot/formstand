// The host globals the library's core and hooks reach for, declared here so
// the DOM-free typecheck (tsconfig.nodom.json) states the contract exactly:
// a console for the dev warnings, timers for the debouncer, an optional
// process.env for the build gates, and an optional localStorage for
// persistForm's default storage. Every one is read through a guard or is
// universally present (Node, browsers, React Native/Hermes, Deno, workers);
// nothing here is a DOM API. If a change makes this file insufficient, the
// core has grown a host dependency and the React Native statement in
// docs/documentation/ssr.md needs revisiting. Lives under scripts/ so the
// root typecheck (which includes tests/) never sees these declarations.
declare const console: Readonly<{
  warn: (...data: readonly unknown[]) => void;
  error: (...data: readonly unknown[]) => void;
}>;
declare function setTimeout(handler: () => void, ms?: number): unknown;
declare function clearTimeout(handle: unknown): void;
declare const process:
  | Readonly<{ env?: Readonly<Record<string, string | undefined>> }>
  | undefined;
// `var`, not `const`: only a var declaration lands on globalThis, which is
// how persist.ts reads it (globalThis.localStorage), guarded.
// eslint-disable-next-line no-var -- see above
declare var localStorage:
  | Readonly<{
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    }>
  | undefined;
