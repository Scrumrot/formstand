import type { z } from "zod";
import type { Form } from "./createForm";

// Draft persistence for a form: watch the values, debounce-write them as JSON
// under a storage key, and re-apply a found draft on the next visit. This is
// the autosave recipe (examples/AutosaveForm) promoted to a helper — same
// caveat as the recipe: drafts round-trip through JSON, so they are for
// JSON-safe values only (Dates become strings, undefined slots drop; the
// helper does NOT try to revive them).

// Structural storage contract — window.localStorage and sessionStorage
// satisfy it, as does any Map-backed stub in tests.
export type PersistStorage = Readonly<{
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}>;

// TSchema is phantom for now (no option carries schema-typed data — drafts
// are typed at the persistForm call, not here), but the parameter keeps the
// option bag tied to the form it configures and leaves room for schema-typed
// options later without a breaking signature change.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type PersistOptions<TSchema extends z.ZodType> = Readonly<{
  // Storage key the draft lives under.
  key: string;
  // Defaults to globalThis.localStorage, guarded: where it is absent or
  // throws on access (SSR, locked-down browsers), persistence is a no-op but
  // the helper still returns working handles.
  storage?: PersistStorage;
  // Trailing-edge debounce for writes. Default 300; 0 writes synchronously
  // on every change.
  debounceMs?: number;
  // How a found draft is applied on start, and what restore() does later.
  // "adopt" (default) uses form.adoptValues — the draft becomes the new
  // baseline, so the form reads CLEAN. "restore" uses form.setValues — the
  // draft loads but stays DIRTY vs the original initial values. "manual"
  // never auto-applies; the caller decides when via the returned restore(),
  // which then applies with adopt semantics (a caller-triggered load is a
  // rebase, not an edit — pick "restore" if you want dirty-vs-initials).
  apply?: "adopt" | "restore" | "manual";
}>;

export type PersistHandle = Readonly<{
  // Load + apply the stored draft now (see `apply` for the semantics):
  // returns true if a draft existed, parsed, and applied. Corrupt or absent
  // JSON returns false and never throws.
  restore: () => boolean;
  // Delete the stored draft (e.g. after a successful submit). Also cancels
  // any pending debounced write, so a stale draft isn't re-written right
  // after clearing.
  clear: () => void;
  // Stop watching the form (does not clear storage). Cancels any pending
  // debounced write.
  dispose: () => void;
}>;

// Resolved lazily inside persistForm — never at module scope — so importing
// this module is SSR-safe. jsdom provides localStorage; node without DOM may
// lack it (typeof check) or throw on access (try/catch).
const defaultStorage = (): PersistStorage | null => {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
};

export const persistForm = <TSchema extends z.ZodType>(
  form: Form<TSchema>,
  options: PersistOptions<TSchema>,
): PersistHandle => {
  const storage = options.storage ?? defaultStorage();
  const debounceMs = options.debounceMs ?? 300;
  const apply = options.apply ?? "adopt";

  // "restore" is a plain values write (dirty vs the original initials);
  // "adopt" and "manual" rebase via adoptValues so the draft reads clean.
  const applyDraft = (values: z.input<TSchema>): void =>
    apply === "restore" ? form.setValues(values) : form.adoptValues(values);

  const restore = (): boolean => {
    // Every storage touch is guarded: private-mode/security errors read as
    // "no draft", corrupt JSON parses as "no draft" — restore never throws.
    try {
      const raw = storage === null ? null : storage.getItem(options.key);
      if (raw === null) return false;
      applyDraft(JSON.parse(raw) as z.input<TSchema>);
      return true;
    } catch {
      return false;
    }
  };

  const writeDraft = (values: z.input<TSchema>): void => {
    // Quota/private-mode setItem errors just skip this write.
    try {
      storage?.setItem(options.key, JSON.stringify(values));
    } catch {
      /* persistence is best-effort */
    }
  };

  // Sanctioned mutable ref for the trailing-edge debounce timer (same shape
  // as the codebase's other timer/subscription refs).
  const timerRef: { current: ReturnType<typeof setTimeout> | null } = {
    current: null,
  };

  const cancelPending = (): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Auto-apply BEFORE subscribing, so applying the draft doesn't immediately
  // schedule a write of the values we just read.
  if (apply !== "manual") {
    restore();
  }

  const unsubscribe = form.watchValues((values) => {
    cancelPending();
    if (debounceMs === 0) {
      writeDraft(values);
    } else {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        writeDraft(values);
      }, debounceMs);
    }
  });

  return Object.freeze({
    restore,
    clear: () => {
      // Cancel first: a pending debounced write landing after removeItem
      // would silently resurrect the draft.
      cancelPending();
      try {
        storage?.removeItem(options.key);
      } catch {
        /* persistence is best-effort */
      }
    },
    dispose: () => {
      cancelPending();
      unsubscribe();
    },
  });
};
