import type { z } from "zod";
import type { Form } from "./createForm";
import { createDebouncer } from "./debounce";
import { isDevBuild } from "./env";
import { isPlainObject } from "./equality";
import type { DefaultPathDepth, PathDepth } from "./fieldPath";
import {
  fieldSchemaForIntrospection,
  isObjectSchemaAt,
  schemaAcceptsUndefined,
  schemaAllowsKindChangeAt,
} from "./validation";

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
  // How a found draft is applied on start, and what load() does later.
  // "adopt" (default) uses form.adoptValues: the draft becomes the new
  // baseline, so the form reads CLEAN. "edit" uses form.setValues: the
  // draft loads but stays DIRTY against the original initial values.
  // "manual" never auto-applies; the caller decides when via the returned
  // load(), which then applies with adopt semantics (a caller-triggered
  // load is a rebase, not an edit; pick "edit" for dirty-vs-initials).
  // "restore" is the pre-0.22 spelling of "edit", kept as an alias: it
  // collided with form.restore(snapshot), which puts back a whole
  // FormState, and with load() (which used to be called restore), three
  // restore-ish words for three behaviors.
  apply?: "adopt" | "edit" | "restore" | "manual";
}>;

export type PersistHandle = Readonly<{
  // Load + apply the stored draft now (see `apply` for the semantics):
  // returns true if a draft existed, parsed, and applied. Corrupt or absent
  // JSON returns false and never throws; a dev build also logs WHY a draft
  // that was present got ignored. (Named load, not restore: the DEFAULT
  // application is adoptValues — a rebase that reads clean — and "restore"
  // promised setValues semantics the method only has when the apply option
  // asks for them.)
  load: () => boolean;
  // Write the pending debounced draft now (a no-op when nothing is
  // pending): for the moments that cannot wait out the debounce, a route
  // change or a pagehide handler.
  flush: () => void;
  // Delete the stored draft (e.g. after a successful submit). Also cancels
  // any pending debounced write, so a stale draft isn't re-written right
  // after clearing, and a rebase that follows (reset(), adoptValues()) does
  // not re-create it either; the next real edit does.
  clear: () => void;
  // Stop watching the form (does not clear storage). Writes any pending
  // debounced draft first: unmounting inside the debounce window used to
  // cancel it, which lost the last edits an autosave exists to keep.
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

const joinPath = (base: string, key: string | number): string =>
  base === "" ? String(key) : `${base}.${String(key)}`;

// The first path where the draft CONFLICTS with the shape the form expects,
// or null when the two agree everywhere they overlap. Only overlapping paths
// are compared, and only their kinds.
//
// Deliberately not a key-set equality check. JSON drops undefined slots, so an
// optional the user never filled is absent from the reference, and an optional
// they did fill is present only in the draft. Neither is evidence of a schema
// change, so treating a key-set difference as corruption would throw away
// perfectly good drafts on any form with an optional field. What IS
// unambiguous is a path holding a string on one side and an object on the
// other: no edit produces that, only a changed schema. Renames and removals
// are the `version` option's job.
//
// `flexibleAt` is the schema's word on a kind mismatch: a coerced number
// behind a "" initial, a pipe, or a union whose variants shape the key
// differently all make the mismatch legitimate (see schemaAllowsKindChangeAt),
// and the guard used to refuse exactly those drafts with no reason given.
const conflictPath = (
  draft: unknown,
  reference: unknown,
  path: string,
  flexibleAt: (path: string) => boolean,
): string | null => {
  // null and undefined carry NO shape information, on either side. null is the
  // canonical empty for a nullable field (see emptyValue), so it can legally
  // appear at any nullable path whatever that path's filled shape is: a
  // nullable object starting null and then filled in, or starting filled and
  // then cleared, are both ordinary edits. Reading either as a kind conflict
  // would discard the drafts of every form with a nullable field.
  if (draft === undefined || draft === null) return null;
  if (reference === undefined || reference === null) return null;
  const draftKind = kindOf(draft);
  const referenceKind = kindOf(reference);
  if (draftKind !== referenceKind) return flexibleAt(path) ? null : path;
  if (draftKind === "array") {
    const [d] = draft as readonly unknown[];
    const [r] = reference as readonly unknown[];
    // Row counts differ for ordinary reasons; the ROW SHAPE is the signal.
    return conflictPath(d, r, joinPath(path, 0), flexibleAt);
  }
  if (draftKind === "object") {
    const d = draft as Record<string, unknown>;
    const r = reference as Record<string, unknown>;
    return Object.keys(d).reduce<string | null>(
      (found, key) =>
        found ?? conflictPath(d[key], r[key], joinPath(path, key), flexibleAt),
      null,
    );
  }
  return null;
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

// What load() found. The boolean the handle returns is "applied"; the
// reason an existing draft was ignored is for the dev-build warning, since
// a silent false left no way to tell a version mismatch from a shape
// conflict from an empty storage slot.
type LoadOutcome =
  | Readonly<{ kind: "applied" }>
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "ignored"; reason: string }>;

export const persistForm = <TSchema extends z.ZodType, D extends PathDepth = DefaultPathDepth>(
  form: Form<TSchema, D>,
  options: PersistOptions<TSchema>,
): PersistHandle => {
  const storage = options.storage ?? defaultStorage();
  const debounceMs = options.debounceMs ?? 300;
  const apply = options.apply ?? "adopt";
  const schema: z.ZodType = form.schema;

  // A draft stored before the schema GAINED a key lacks that key, and
  // applying it wholesale erased the key's initial value from values AND
  // initialValues (reset() could not bring it back, and the user met zod's
  // generic message instead of the author's). Fill the gap from the initial
  // values, but only where the schema does NOT accept undefined there: an
  // optional key absent from the draft may have been cleared on purpose
  // (JSON drops undefined), and filling it would undo that edit, while a
  // nullable-but-required key cannot hold the hole at all. Objects recurse
  // so a nested gain is covered, but only while the schema says the
  // container IS a plain object: under a union the draft's keys belong to
  // whichever variant it holds (walking the initial values' variant spliced
  // its key into another variant), and a record key the draft lacks was
  // removed on purpose. Arrays are left alone (row counts differ for
  // ordinary reasons). A key the schema walk cannot place is filled too:
  // the initial value is the author's default, the safer guess.
  const fillRequiredGaps = (
    draft: unknown,
    initial: unknown,
    path: string,
  ): unknown => {
    if (!isPlainObject(draft) || !isPlainObject(initial)) return draft;
    if (!isObjectSchemaAt(schema, path)) return draft;
    return Object.keys(initial).reduce<Record<string, unknown>>(
      (acc, key) => {
        const childPath = joinPath(path, key);
        if (Object.hasOwn(draft, key)) {
          const next = fillRequiredGaps(draft[key], initial[key], childPath);
          return Object.is(next, draft[key]) ? acc : { ...acc, [key]: next };
        }
        if (initial[key] === undefined) return acc;
        const sub = fieldSchemaForIntrospection(schema, childPath);
        return sub !== null && schemaAcceptsUndefined(sub)
          ? acc
          : { ...acc, [key]: initial[key] };
      },
      draft,
    );
  };

  // Armed while a draft is being written into the form. The values watcher
  // below fires synchronously inside the write, so a manual load() used to
  // schedule a write of the very draft it had just read. (The auto-apply at
  // construction runs before the watcher exists; only a later load() meets
  // it.) A sanctioned mutable ref, like `cleared` below.
  const applying = { current: false };

  // "edit" (and its alias "restore") is a plain values write (dirty vs the
  // original initials); "adopt" and "manual" rebase via adoptValues so the
  // draft reads clean.
  const applyDraft = (values: z.input<TSchema>): void => {
    const filled = fillRequiredGaps(
      values,
      form.getState().initialValues,
      "",
    ) as z.input<TSchema>;
    applying.current = true;
    try {
      if (apply === "edit" || apply === "restore") {
        form.setValues(filled);
      } else {
        form.adoptValues(filled);
      }
    } finally {
      applying.current = false;
    }
  };

  // Is the draft already what the form holds, compared in stored form (the
  // keys a previous apply filled were written back, so they read equal)?
  // A non-serializable values tree cannot be compared and counts as new.
  const isCurrent = (values: unknown): boolean => {
    try {
      return (
        JSON.stringify(values) === JSON.stringify(form.getState().values)
      );
    } catch {
      return false;
    }
  };

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

  const flexibleAt = (path: string): boolean =>
    schemaAllowsKindChangeAt(schema, path);

  const inspect = (skipWhenCurrent: boolean): LoadOutcome => {
    // Every storage touch is guarded: private-mode/security errors read as
    // "no draft", corrupt JSON as an ignored one — load never throws.
    const raw = ((): string | null => {
      try {
        return storage === null ? null : storage.getItem(options.key);
      } catch {
        return null;
      }
    })();
    if (raw === null) return { kind: "absent" };
    try {
      const parsed: unknown = JSON.parse(raw);
      // Versioned drafts are wrapped; unversioned ones are the bare values,
      // which is the format every existing draft is already in.
      const versioned =
        options.version !== undefined &&
        typeof parsed === "object" &&
        parsed !== null &&
        "__v" in parsed;
      if (options.version !== undefined && !versioned) {
        return {
          kind: "ignored",
          reason: `it carries no version and this configuration expects version ${String(options.version)}`,
        };
      }
      // The config-downgrade hole: a draft WRITTEN with a version is the
      // {__v, values} wrapper, and if the app later ships without the
      // version option, nothing above catches it — the wrapper's keys
      // don't overlap the reference shape, so the shape guard stays quiet
      // and the WRAPPER OBJECT gets adopted as form values (then
      // re-persisted, making the corruption self-sustaining). A versioned
      // draft under a version-less config is a contract the current app
      // no longer declares: discard it, like every other draft the config
      // cannot vouch for.
      if (
        options.version === undefined &&
        typeof parsed === "object" &&
        parsed !== null &&
        Object.hasOwn(parsed, "__v") &&
        Object.hasOwn(parsed, "values")
      ) {
        return {
          kind: "ignored",
          reason: "it was written with a version and this configuration has none",
        };
      }
      const wrapper = parsed as unknown as {
        readonly __v?: unknown;
        readonly values?: unknown;
      };
      if (versioned && wrapper.__v !== options.version) {
        return {
          kind: "ignored",
          reason: `its version (${String(wrapper.__v)}) is not the configured version (${String(options.version)})`,
        };
      }
      // A wrapper with no payload is not a draft. Only reachable via tampered
      // or foreign storage, but applying it would write undefined over the
      // whole values object.
      if (versioned && wrapper.values === undefined) {
        return { kind: "ignored", reason: "its version wrapper holds no values" };
      }
      const values = (versioned ? wrapper.values : parsed) as z.input<TSchema>;
      // A null or missing TOP-LEVEL payload is not a draft either (an
      // unversioned "null" in storage, or a versioned wrapper holding
      // values: null). The shape guard deliberately treats null as shapeless
      // because nested nullable fields legally hold it, so the top level is
      // the one place to refuse it: adoptValues(null) would make every path
      // read on the form crash and then re-persist the same null.
      if (values === null || values === undefined) {
        return { kind: "ignored", reason: "it holds no values" };
      }
      // A draft whose shape conflicts with the form's is from another schema.
      // Applying it would rebase the form onto values it cannot validate, and
      // because "adopt" clears errors, the form would read CLEAN while holding
      // them. Ignore it instead; the next change overwrites it.
      const reference = referenceShape();
      const conflict =
        reference === undefined
          ? null
          : conflictPath(values, reference, "", flexibleAt);
      if (conflict !== null) {
        return {
          kind: "ignored",
          reason: `its shape conflicts with the form's initial values at "${conflict}" (set the version option when the schema changes)`,
        };
      }
      // The auto-apply skips a draft the form already holds: a resubscribe
      // (usePersistForm after dispose() flushed the values), StrictMode's
      // second mount, or initial values equal to the draft. Applying again
      // would only rebase, clearing errors and dirty state, and with an
      // inline storage object every render resubscribed, every resubscribe
      // re-adopted and every adopt re-rendered. A caller's load() applies
      // regardless: that call asks for the rebase.
      if (skipWhenCurrent && isCurrent(values)) return { kind: "applied" };
      applyDraft(values);
      return { kind: "applied" };
    } catch {
      return { kind: "ignored", reason: "it is not valid JSON" };
    }
  };

  const loadWith = (skipWhenCurrent: boolean): boolean => {
    const outcome = inspect(skipWhenCurrent);
    if (outcome.kind === "ignored" && isDevBuild()) {
      console.warn(
        `[formstand] persistForm: ignored the draft under "${options.key}": ${outcome.reason}. The next edit overwrites it.`,
      );
    }
    return outcome.kind === "applied";
  };
  const load = (): boolean => loadWith(false);

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

  // Trailing-edge debounce of draft writes (0 = write synchronously).
  const writes = createDebouncer(debounceMs);

  // Auto-apply BEFORE subscribing, so applying the draft doesn't immediately
  // schedule a write of the values we just read.
  if (apply !== "manual") {
    loadWith(true);
  }

  // Armed by clear(): the usual after-submit pair is clear() then reset(),
  // and the reset's values change used to write the fresh baseline straight
  // back as a draft, which the next visit then adopted over whatever initial
  // values the app had meanwhile computed. A rebase leaves values ===
  // initialValues (reset, adoptValues, a pristine restore); while armed,
  // such a write is skipped. Any real edit disarms it. A sanctioned mutable
  // ref, like the timer handle inside the debouncer.
  const cleared = { current: false };

  const unsubscribe = form.watchValues((values) => {
    if (applying.current) return;
    if (cleared.current && values === form.getState().initialValues) return;
    cleared.current = false;
    writes.schedule(() => writeDraft(values));
  });

  return Object.freeze({
    load,
    flush: () => writes.flush(),
    clear: () => {
      // Cancel first: a pending debounced write landing after removeItem
      // would silently resurrect the draft.
      writes.cancel();
      cleared.current = true;
      try {
        storage?.removeItem(options.key);
      } catch {
        /* persistence is best-effort */
      }
    },
    dispose: () => {
      writes.flush();
      unsubscribe();
    },
  });
};
