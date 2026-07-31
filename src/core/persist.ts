import type { z } from "zod";
import type { Form } from "./createForm";
import type { DefaultPathDepth, PathDepth } from "./fieldPath";

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
  // Bump when the schema's SHAPE changes and old drafts should be discarded
  // rather than applied. A draft is stored with the version it was written
  // under and ignored when the two disagree, which is the only reliable way
  // to catch a renamed or removed field: an absent key is indistinguishable
  // from an optional the user never filled in, so the automatic guard below
  // cannot tell those apart. Leaving this unset keeps the stored format
  // exactly as it was, so existing drafts survive an upgrade.
  version?: string | number;
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

// The JSON kind of a value, as it exists AFTER a storage round trip. The
// reference side is round-tripped before comparison rather than special-cased,
// so a Date (which stores as a string) compares against a string and the
// documented Date-becomes-string limitation is not mistaken for corruption.
const kindOf = (value: unknown): string =>
  value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : typeof value;

// Does the draft CONFLICT with the shape the form expects? Only overlapping
// paths are compared, and only their kinds.
//
// Deliberately not a key-set equality check. JSON drops undefined slots, so an
// optional the user never filled is absent from the reference, and an optional
// they did fill is present only in the draft. Neither is evidence of a schema
// change, so treating a key-set difference as corruption would throw away
// perfectly good drafts on any form with an optional field. What IS
// unambiguous is a path holding a string on one side and an object on the
// other: no edit produces that, only a changed schema. Renames and removals
// are the `version` option's job.
const conflictsWith = (draft: unknown, reference: unknown): boolean => {
  const draftKind = kindOf(draft);
  const referenceKind = kindOf(reference);
  // An absent reference slot says nothing: the form may simply hold undefined
  // there. Same for an absent draft slot.
  if (draft === undefined || reference === undefined) return false;
  if (draftKind !== referenceKind) return true;
  if (draftKind === "array") {
    const [d] = draft as readonly unknown[];
    const [r] = reference as readonly unknown[];
    // Row counts differ for ordinary reasons; the ROW SHAPE is the signal.
    return conflictsWith(d, r);
  }
  if (draftKind === "object") {
    const d = draft as Record<string, unknown>;
    const r = reference as Record<string, unknown>;
    return Object.keys(d).some((key) => conflictsWith(d[key], r[key]));
  }
  return false;
};

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

export const persistForm = <TSchema extends z.ZodType, D extends PathDepth = DefaultPathDepth>(
  form: Form<TSchema, D>,
  options: PersistOptions<TSchema>,
): PersistHandle => {
  const storage = options.storage ?? defaultStorage();
  const debounceMs = options.debounceMs ?? 300;
  const apply = options.apply ?? "adopt";

  // "restore" is a plain values write (dirty vs the original initials);
  // "adopt" and "manual" rebase via adoptValues so the draft reads clean.
  const applyDraft = (values: z.input<TSchema>): void =>
    apply === "restore" ? form.setValues(values) : form.adoptValues(values);

  // The shape the draft is checked against, in stored form. Round-tripping
  // the reference through JSON puts both sides in the same representation.
  const referenceShape = (): unknown => {
    try {
      return JSON.parse(JSON.stringify(form.getState().initialValues));
    } catch {
      // A non-serializable initial value means we cannot compare; the write
      // path would have failed too, so let the draft through unchecked
      // rather than rejecting every draft for this form.
      return undefined;
    }
  };

  const restore = (): boolean => {
    // Every storage touch is guarded: private-mode/security errors read as
    // "no draft", corrupt JSON parses as "no draft" — restore never throws.
    try {
      const raw = storage === null ? null : storage.getItem(options.key);
      if (raw === null) return false;
      const parsed: unknown = JSON.parse(raw);
      // Versioned drafts are wrapped; unversioned ones are the bare values,
      // which is the format every existing draft is already in.
      const versioned =
        options.version !== undefined &&
        typeof parsed === "object" &&
        parsed !== null &&
        "__v" in parsed;
      if (options.version !== undefined && !versioned) return false;
      const wrapper = parsed as unknown as {
        readonly __v?: unknown;
        readonly values?: unknown;
      };
      if (versioned && wrapper.__v !== options.version) return false;
      const values = (versioned ? wrapper.values : parsed) as z.input<TSchema>;
      // A draft whose shape conflicts with the form's is from another schema.
      // Applying it would rebase the form onto values it cannot validate, and
      // because "adopt" clears errors, the form would read CLEAN while holding
      // them. Ignore it instead; the next change overwrites it.
      const reference = referenceShape();
      if (reference !== undefined && conflictsWith(values, reference)) {
        return false;
      }
      applyDraft(values);
      return true;
    } catch {
      return false;
    }
  };

  const writeDraft = (values: z.input<TSchema>): void => {
    // Quota/private-mode setItem errors just skip this write. The wrapper is
    // written ONLY when a version is configured, so a form that never opts in
    // keeps the exact bytes it wrote before and its existing drafts still load.
    try {
      storage?.setItem(
        options.key,
        JSON.stringify(
          options.version === undefined
            ? values
            : { __v: options.version, values },
        ),
      );
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
