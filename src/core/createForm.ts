import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import {
  type IndexMapper,
  insertAt,
  moveFromTo,
  reKeyByArrayPath,
  removeAt,
  swapIndices,
} from "./array";
import { isFieldDirty, isPlainObject, valuesEqual } from "./equality";
import type { FieldPath, FieldValue } from "./fieldPath";
import type { ValidationMode } from "./mode";
import { getAtPath, setAtPath, slotAtPath } from "./path";
import type { BoolMap, ErrorMap, FormState } from "./types";
import {
  type FieldValidationResult,
  type SettledFieldValidationResult,
  type SettledValidationResult,
  type ValidationResult,
  fieldSchemaAtPath,
  isAsyncRequiredError,
  isPathOrChild,
  prefixErrorKeys,
  validateAsync,
  validateSync,
} from "./validation";

export type ReadonlyStoreApi<T> = Pick<
  StoreApi<T>,
  "getState" | "getInitialState" | "subscribe"
>;

export type CreateFormOptions<TSchema extends z.ZodType> = Readonly<{
  initialValues: z.input<TSchema>;
  mode?: ValidationMode;
  reValidateMode?: ValidationMode;
  // Run a full validation pass at creation so the error map (and flags derived
  // from it, like `useIsValid`) reflect the initial values immediately rather
  // than reading as error-free until the first blur/change/submit. Async
  // schemas validate in the background. Note this surfaces errors for untouched
  // fields right away — gate error display on `touched` if that's not wanted.
  validateOnMount?: boolean;
}>;

export type SubmitHandler<TSchema extends z.ZodType> = (
  data: z.output<TSchema>,
) => void | Promise<void>;

export type InvalidSubmitHandler = (errors: ErrorMap) => void;

export type SubmitOptions = Readonly<{
  force?: boolean;
}>;

// "valid": validation passed and onValid ran to completion. "invalid":
// validation failed (onInvalid ran; errors written and their fields marked
// touched, unless the values changed while validation was in flight — see
// submit). "skipped": another submit was already in flight and force wasn't
// set. "error": onValid threw or rejected — submit resolves with the thrown
// value instead of rejecting, so handleSubmit used as an event handler never
// produces an unhandled rejection. No error state is written for this kind;
// surface the failure yourself (e.g. via setError).
export type SubmitResult<TOutput> =
  | Readonly<{ kind: "valid"; data: TOutput }>
  | Readonly<{ kind: "invalid"; errors: ErrorMap }>
  | Readonly<{ kind: "skipped" }>
  | Readonly<{ kind: "error"; error: unknown }>;

type ArrayItemOf<T> = T extends readonly (infer U)[] ? U : never;

// Root-level errors (schema-wide .refine) live at the "" key.
type ErrorPath<TValues> = FieldPath<TValues> | "";

// No keepDirty: per-field dirtiness is derived from values vs initialValues,
// and reset makes those equal by definition — a kept dirty map would say
// "dirty" while every field-level read says "clean".
export type ResetOptions = Readonly<{
  keepErrors?: boolean;
  keepTouched?: boolean;
  keepSubmitCount?: boolean;
}>;

export type FieldSnapshot<TValue> = Readonly<{
  value: TValue;
  error: readonly string[] | undefined;
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
}>;

const shallowFieldEqual = <TValue>(
  a: FieldSnapshot<TValue>,
  b: FieldSnapshot<TValue>,
): boolean =>
  Object.is(a.value, b.value) &&
  a.error === b.error &&
  a.touched === b.touched &&
  a.dirty === b.dirty &&
  a.isValidating === b.isValidating;

export type Form<TSchema extends z.ZodType> = Readonly<{
  schema: TSchema;
  store: ReadonlyStoreApi<FormState<z.input<TSchema>>>;
  getState: () => FormState<z.input<TSchema>>;
  subscribe: (
    listener: (
      state: FormState<z.input<TSchema>>,
      prev: FormState<z.input<TSchema>>,
    ) => void,
  ) => () => void;
  getField: <P extends FieldPath<z.input<TSchema>>>(
    path: P,
  ) => FieldValue<z.input<TSchema>, P>;
  watchField: <P extends FieldPath<z.input<TSchema>>>(
    path: P,
    listener: (snapshot: FieldSnapshot<FieldValue<z.input<TSchema>, P>>) => void,
  ) => () => void;
  watchValue: <P extends FieldPath<z.input<TSchema>>>(
    path: P,
    listener: (
      value: FieldValue<z.input<TSchema>, P>,
      previous: FieldValue<z.input<TSchema>, P>,
    ) => void,
  ) => () => void;
  watchValues: (
    listener: (
      values: z.input<TSchema>,
      previous: z.input<TSchema>,
    ) => void,
  ) => () => void;
  setValue: <P extends FieldPath<z.input<TSchema>>>(
    path: P,
    value: FieldValue<z.input<TSchema>, P>,
  ) => void;
  setValues: (next: z.input<TSchema>) => void;
  setTouched: (path: FieldPath<z.input<TSchema>>, touched?: boolean) => void;
  setSubmitting: (value: boolean) => void;
  setMode: (mode: ValidationMode) => void;
  setReValidateMode: (mode: ValidationMode) => void;
  setError: (
    path: ErrorPath<z.input<TSchema>>,
    errors: string | readonly string[],
  ) => void;
  setErrors: (errors: ErrorMap) => void;
  clearErrors: (path?: ErrorPath<z.input<TSchema>>) => void;
  // The patch type omits `errors`: the merged map is derived from
  // schemaErrors/serverErrors, so writing it directly is unrepresentable for
  // TS callers (plain-JS writes are ignored with a warning).
  updateState: (
    updater: (
      state: FormState<z.input<TSchema>>,
    ) => Partial<Omit<FormState<z.input<TSchema>>, "errors">>,
  ) => void;
  reset: (
    nextInitial?: Partial<z.input<TSchema>>,
    options?: ResetOptions,
  ) => void;
  // Reset one field to its initial value, clearing its (and its descendants')
  // dirty/touched/error state.
  resetField: (path: FieldPath<z.input<TSchema>>) => void;
  adoptValues: (values: z.input<TSchema>) => void;
  // One-shot read of a field's full slice (value/error/touched/dirty/
  // isValidating) — the imperative sibling of useField's state.
  getFieldState: <P extends FieldPath<z.input<TSchema>>>(
    path: P,
  ) => FieldSnapshot<FieldValue<z.input<TSchema>, P>>;
  validate: () => ValidationResult<z.output<TSchema>>;
  validateField: (path: ErrorPath<z.input<TSchema>>) => FieldValidationResult;
  // Returns a Promise (the async pass, already started) when the schema needs
  // async parsing — mirroring the "pending" result of validate/validateField.
  validateFields: (
    paths: readonly FieldPath<z.input<TSchema>>[],
  ) => boolean | Promise<boolean>;
  validateAsync: () => Promise<ValidationResult<z.output<TSchema>>>;
  validateFieldAsync: (
    path: ErrorPath<z.input<TSchema>>,
  ) => Promise<FieldValidationResult>;
  validateFieldsAsync: (
    paths: readonly FieldPath<z.input<TSchema>>[],
  ) => Promise<boolean>;
  submit: (
    onValid: SubmitHandler<TSchema>,
    onInvalid?: InvalidSubmitHandler,
    options?: SubmitOptions,
  ) => Promise<SubmitResult<z.output<TSchema>>>;
  arrayPush: <P extends FieldPath<z.input<TSchema>>>(
    path: P,
    item: ArrayItemOf<NonNullable<FieldValue<z.input<TSchema>, P>>>,
  ) => void;
  arrayRemove: (path: FieldPath<z.input<TSchema>>, index: number) => void;
  arrayInsert: <P extends FieldPath<z.input<TSchema>>>(
    path: P,
    index: number,
    item: ArrayItemOf<NonNullable<FieldValue<z.input<TSchema>, P>>>,
  ) => void;
  arrayMove: (
    path: FieldPath<z.input<TSchema>>,
    from: number,
    to: number,
  ) => void;
  arraySwap: (path: FieldPath<z.input<TSchema>>, a: number, b: number) => void;
  handleSubmit: (
    onValid: SubmitHandler<TSchema>,
    onInvalid?: InvalidSubmitHandler,
    options?: SubmitOptions,
  ) => (event?: {
    preventDefault: () => void;
  }) => Promise<SubmitResult<z.output<TSchema>>>;
  diff: () => Readonly<Record<string, unknown>>;
  dirtyFields: () => readonly string[];
  snapshot: () => FormState<z.input<TSchema>>;
  restore: (snapshot: FormState<z.input<TSchema>>) => void;
}>;

const emptyErrors = {} as ErrorMap;
const emptyBools = {} as BoolMap;

const identityMapper: IndexMapper = (n) => n;

const omitKey = <V>(
  map: Readonly<Record<string, V>>,
  key: string,
): Readonly<Record<string, V>> =>
  Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));

const inScopeOfAny = (key: string, paths: readonly string[]): boolean =>
  paths.some((p) => isPathOrChild(key, p));

// Drop every entry keyed at or under any of `paths` ("items" covers
// "items.0.name") — the shared scope filter for the path-keyed maps. Returns
// the input map unchanged when nothing is in scope, so identity-based
// subscribers don't re-fire.
const omitScope = <V>(
  map: Readonly<Record<string, V>>,
  paths: readonly string[],
): Readonly<Record<string, V>> => {
  const entries = Object.entries(map);
  const kept = entries.filter(([k]) => !inScopeOfAny(k, paths));
  return kept.length === entries.length ? map : Object.fromEntries(kept);
};

const pickScope = <V>(
  map: Readonly<Record<string, V>>,
  paths: readonly string[],
): Readonly<Record<string, V>> =>
  Object.fromEntries(
    Object.entries(map).filter(([k]) => inScopeOfAny(k, paths)),
  );

// Replace the slice of `prev` at or under `paths` with `scoped` (whose keys
// must already be within scope).
const mergeScopedErrors = (
  prev: ErrorMap,
  scoped: ErrorMap,
  paths: readonly string[],
): ErrorMap => ({ ...omitScope(prev, paths), ...scoped });

// Drop entries at `path` itself or an ancestor of it ("a" over "a.b"). The
// root "" entry is an ancestor of every path, so any value write releases it
// — a value write below a container stales the container-level server
// verdict too, per the documented release contract.
const releaseAncestorEntries = <V>(
  map: Readonly<Record<string, V>>,
  path: string,
): Readonly<Record<string, V>> => {
  const entries = Object.entries(map);
  const kept = entries.filter(([k]) => k !== "" && !isPathOrChild(path, k));
  return kept.length === entries.length ? map : Object.fromEntries(kept);
};

// Minimal divergent paths between values and initialValues: recurse through
// plain objects, report anything else (scalars, arrays, type mismatches) at
// its own path — arrays report their base path, and a divergent non-record
// root reports "". This is the derived source for diff()/dirtyFields(); the
// boolean per-field question is isFieldDirty.
const dirtyPathsOf = (
  values: unknown,
  initial: unknown,
  prefix: string,
): readonly string[] => {
  if (valuesEqual(values, initial)) return [];
  if (isPlainObject(values) && isPlainObject(initial)) {
    const keys = new Set([...Object.keys(values), ...Object.keys(initial)]);
    const childPaths = [...keys].flatMap((k) =>
      dirtyPathsOf(
        values[k],
        initial[k],
        prefix === "" ? k : `${prefix}.${k}`,
      ),
    );
    // valuesEqual said the objects differ, but no child diverges by its own
    // comparison — a key-count mismatch where the extra key holds undefined
    // ({} vs { nickname: undefined }). Report the object itself so diff()/
    // dirtyFields() stay non-empty whenever isFieldDirty/useIsDirty say dirty.
    return childPaths.length > 0 ? childPaths : [prefix];
  }
  return [prefix];
};

// Key for the whole-form async validation's sequence counter (internal —
// form-level in-flight state lives in FormState.isValidatingForm).
const FORM_SEQ_KEY = "__form__";

const stringArraysEqual = (
  a: readonly string[],
  b: readonly string[],
): boolean => a === b || (a.length === b.length && a.every((v, i) => v === b[i]));

// Preserve the previous array reference for entries whose messages didn't
// change (and the previous map itself when nothing changed at all), so field
// subscriptions comparing errors by identity don't re-fire on every pass.
const reuseErrorRefs = (next: ErrorMap, prev: ErrorMap): ErrorMap => {
  if (next === prev) return prev;
  const entries = Object.entries(next).map(([k, v]) => {
    const old = prev[k];
    return [
      k,
      old !== undefined && stringArraysEqual(old, v) ? old : v,
    ] as const;
  });
  const sameShape =
    entries.length === Object.keys(prev).length &&
    entries.every(([k, v]) => prev[k] === v);
  return sameShape ? prev : Object.fromEntries(entries);
};

// Shape a parse result into an error map scoped to `path`: sub-schema results
// re-key to absolute form paths; full-form results filter to the path's scope,
// except the root "" whose scope is explicitly the whole form.
const scopeSettledResult = (
  result: SettledValidationResult<unknown>,
  path: string,
  viaSubschema: boolean,
): ErrorMap =>
  result.kind !== "invalid"
    ? emptyErrors
    : viaSubschema
      ? prefixErrorKeys(result.errors, path)
      : path === ""
        ? result.errors
        : pickScope(result.errors, [path]);

// The one merge rule between the two error channels: the schema's message
// wins at a key (it re-judged the same value the server did), server entries
// show where the schema is silent. Returns the schema map's identity when
// the server channel adds nothing.
const mergeErrorChannels = (schema: ErrorMap, server: ErrorMap): ErrorMap => {
  const extra = Object.entries(server).filter(([k]) => schema[k] === undefined);
  return extra.length === 0
    ? schema
    : { ...schema, ...Object.fromEntries(extra) };
};

type ErrorChannels = Readonly<{
  errors: ErrorMap;
  schemaErrors: ErrorMap;
  serverErrors: ErrorMap;
}>;

// The one way error state is written: patch a channel (or both) and the
// user-visible `errors` map is re-derived, reusing per-key refs so
// identity-based subscribers don't re-fire.
const errorChannels = (
  state: ErrorChannels,
  patch: Readonly<{ schemaErrors?: ErrorMap; serverErrors?: ErrorMap }>,
): ErrorChannels => {
  const schemaErrors = patch.schemaErrors ?? state.schemaErrors;
  const serverErrors = patch.serverErrors ?? state.serverErrors;
  // Unchanged channels mean an unchanged merge — skip it, so no-op writes
  // (every keystroke with an empty server channel) don't rescan the map.
  if (
    schemaErrors === state.schemaErrors &&
    serverErrors === state.serverErrors
  ) {
    return { errors: state.errors, schemaErrors, serverErrors };
  }
  return {
    schemaErrors,
    serverErrors,
    errors: reuseErrorRefs(
      mergeErrorChannels(schemaErrors, serverErrors),
      state.errors,
    ),
  };
};

// The release contract for a value write at `path`: server entries at the
// path or below go (that subtree was replaced), entries at ancestors go too
// (container verdicts are stale), and a runtime "" path (the imperative
// surface is string-typed) releases everything.
const releaseSpine = (server: ErrorMap, path: string): ErrorMap =>
  path === ""
    ? emptyErrors
    : releaseAncestorEntries(omitScope(server, [path]), path);

// A bulk values write releases only the verdicts whose value slice actually
// changed — a server error on an untouched field survives a setValues that
// rewrites its siblings. The "" entry compares the whole values object, so
// any change releases a form-level verdict.
const releaseChangedSlices = (
  server: ErrorMap,
  prevValues: unknown,
  nextValues: unknown,
): ErrorMap => {
  const entries = Object.entries(server);
  const kept = entries.filter(([k]) =>
    valuesEqual(getAtPath(prevValues, k), getAtPath(nextValues, k)),
  );
  return kept.length === entries.length ? server : Object.fromEntries(kept);
};

export const createForm = <TSchema extends z.ZodType>(
  schema: TSchema,
  options: CreateFormOptions<TSchema>,
): Form<TSchema> => {
  type Values = z.input<TSchema>;

  const initialMode: ValidationMode = options.mode ?? "onBlur";
  const initialReValidateMode: ValidationMode =
    options.reValidateMode ?? "onChange";

  const initial: FormState<Values> = {
    values: options.initialValues,
    initialValues: options.initialValues,
    errors: emptyErrors,
    schemaErrors: emptyErrors,
    serverErrors: emptyErrors,
    touched: emptyBools,
    isSubmitting: false,
    submitCount: 0,
    isValidating: emptyBools,
    isValidatingForm: false,
    mode: initialMode,
    reValidateMode: initialReValidateMode,
  };

  const store = createStore<FormState<Values>>(() => initial);

  // A full pass replaces the schema channel wholesale; the server channel is
  // untouched, which is the whole preservation story — a background pass
  // can't wipe a server verdict because it never writes that channel.
  const commitFullPass = (
    state: FormState<Values>,
    next: ErrorMap,
  ): ErrorChannels =>
    errorChannels(state, {
      schemaErrors: reuseErrorRefs(next, state.schemaErrors),
    });

  const validate = (): ValidationResult<z.output<TSchema>> => {
    try {
      const result = validateSync(schema, store.getState().values);
      store.setState((state) => ({
        ...state,
        ...commitFullPass(
          state,
          result.kind === "invalid" ? result.errors : emptyErrors,
        ),
      }));
      return result;
    } catch (e) {
      if (isAsyncRequiredError(e)) {
        return { kind: "pending", promise: validateAsyncOnForm() };
      }
      throw e;
    }
  };

  const validateFields = (
    paths: readonly string[],
  ): boolean | Promise<boolean> => {
    if (paths.length === 0) return true;
    // A "" path means whole-form scope (only reachable past the FieldPath
    // type, e.g. runtime-built path lists): delegate to the full pass so
    // manual errors are preserved, mirroring validateField("").
    if (paths.some((p) => p === "")) {
      const result = validate();
      return result.kind === "pending"
        ? result.promise.then((r) => r.kind === "valid")
        : result.kind === "valid";
    }
    try {
      const result = validateSync(schema, store.getState().values);
      const fullErrors =
        result.kind === "invalid" ? result.errors : emptyErrors;
      store.setState((state) => ({
        ...state,
        ...errorChannels(state, {
          schemaErrors: reuseErrorRefs(
            mergeScopedErrors(
              state.schemaErrors,
              pickScope(fullErrors, paths),
              paths,
            ),
            state.schemaErrors,
          ),
          // A validation explicitly targeting these paths supersedes any
          // server verdict on them.
          serverErrors: omitScope(state.serverErrors, paths),
        }),
      }));
      return Object.keys(fullErrors).every((k) => !inScopeOfAny(k, paths));
    } catch (e) {
      if (isAsyncRequiredError(e)) return validateFieldsAsync(paths);
      throw e;
    }
  };

  // How to validate one field: parse its extracted subschema against the
  // slot's value when the path is reachable through check-free objects/
  // arrays, parse the full form filtered to the path's scope otherwise (so
  // cross-field refinements targeting the path still land), or skip when the
  // path addresses no slot (an out-of-range array index — parsing the
  // subschema against undefined would fabricate an error no full-form parse
  // produces). One "parse" variant carries the whole triple so the sync and
  // async passes cannot diverge arm-by-arm.
  type FieldScope =
    | Readonly<{ kind: "skip" }>
    | Readonly<{
        kind: "parse";
        schema: z.ZodType;
        value: unknown;
        viaSubschema: boolean;
      }>;

  // The subschema for a path is a pure function of the form's fixed schema —
  // cache it so per-keystroke validation doesn't re-walk the schema.
  const subschemaCache = new Map<string, z.ZodType | null>();
  const subschemaAt = (path: string): z.ZodType | null => {
    const cached = subschemaCache.get(path);
    if (cached !== undefined) return cached;
    const sub = fieldSchemaAtPath(schema, path);
    subschemaCache.set(path, sub);
    return sub;
  };

  const fieldScopeFor = (path: string, values: Values): FieldScope => {
    const sub = path === "" ? null : subschemaAt(path);
    if (sub === null) {
      return { kind: "parse", schema, value: values, viaSubschema: false };
    }
    const slot = slotAtPath(values, path);
    return slot.exists
      ? { kind: "parse", schema: sub, value: slot.value, viaSubschema: true }
      : { kind: "skip" };
  };

  const scopedFieldErrors = (path: string): ErrorMap => {
    const values = store.getState().values;
    const scope = fieldScopeFor(path, values);
    return scope.kind === "skip"
      ? emptyErrors
      : scopeSettledResult(
          validateSync(scope.schema, scope.value),
          path,
          scope.viaSubschema,
        );
  };

  const scopedFieldErrorsAsync = async (
    path: string,
    values: Values,
  ): Promise<ErrorMap> => {
    const scope = fieldScopeFor(path, values);
    return scope.kind === "skip"
      ? emptyErrors
      : scopeSettledResult(
          await validateAsync(scope.schema, scope.value),
          path,
          scope.viaSubschema,
        );
  };

  const fieldResult = (scoped: ErrorMap): SettledFieldValidationResult => {
    const messages = Object.values(scoped).flat();
    return messages.length === 0
      ? { kind: "valid" }
      : { kind: "invalid", errors: messages };
  };

  // How a field validation's scoped errors land in state. validateField("")
  // is a whole-form pass, so it lands like validate() (server channel
  // untouched). A real field path also releases the server entries in its
  // scope — a validation explicitly targeting them supersedes the server
  // verdict. Shared by the sync and async passes so their commit semantics
  // cannot diverge.
  const commitFieldErrors = (
    state: FormState<Values>,
    scoped: ErrorMap,
    path: string,
  ): ErrorChannels =>
    path === ""
      ? commitFullPass(state, scoped)
      : errorChannels(state, {
          schemaErrors: reuseErrorRefs(
            mergeScopedErrors(state.schemaErrors, scoped, [path]),
            state.schemaErrors,
          ),
          serverErrors: omitScope(state.serverErrors, [path]),
        });

  const validateField = (path: string): FieldValidationResult => {
    try {
      const scoped = scopedFieldErrors(path);
      store.setState((state) => ({
        ...state,
        ...commitFieldErrors(state, scoped, path),
      }));
      return fieldResult(scoped);
    } catch (e) {
      if (isAsyncRequiredError(e)) {
        return { kind: "pending", promise: validateFieldAsync(path) };
      }
      throw e;
    }
  };

  const snapshotField = (
    state: FormState<Values>,
    path: string,
  ): FieldSnapshot<unknown> => {
    const value = getAtPath(state.values, path);
    return {
      value,
      error: state.errors[path],
      touched: state.touched[path] ?? false,
      dirty: isFieldDirty(value, getAtPath(state.initialValues, path)),
      isValidating: state.isValidating[path] ?? false,
    };
  };

  const sequences = new Map<string, number>();

  // Globally monotonic counter behind nextSeq (a sanctioned mutable-ref
  // cache, like the subscription refs). It must never reset: reset()/
  // adoptValues() clear the `sequences` map to release per-path memory, and
  // if numbering restarted per key, a post-reset pass could mint the same
  // seq an in-flight pre-reset pass still holds — the old pass would pass
  // the ownership check and commit against values it never validated.
  // Cleared keys read as undefined, which matches no live seq, so orphaned
  // passes are permanently disowned instead.
  const seqRef = { current: 0 };

  const nextSeq = (key: string): number => {
    seqRef.current += 1;
    sequences.set(key, seqRef.current);
    return seqRef.current;
  };

  const validateAsyncOnForm = async (): Promise<
    SettledValidationResult<z.output<TSchema>>
  > => {
    const seq = nextSeq(FORM_SEQ_KEY);
    const valuesAtStart = store.getState().values;
    store.setState((state) => ({ ...state, isValidatingForm: true }));

    const result = await validateAsync(schema, valuesAtStart);

    const live = store.getState();
    const stillOwns = sequences.get(FORM_SEQ_KEY) === seq;
    if (!stillOwns || live.values !== valuesAtStart) {
      if (stillOwns) {
        store.setState((state) => ({ ...state, isValidatingForm: false }));
      }
      return result;
    }

    store.setState((state) => ({
      ...state,
      ...commitFullPass(
        state,
        result.kind === "invalid" ? result.errors : emptyErrors,
      ),
      isValidatingForm: false,
    }));
    return result;
  };

  const validateFieldsAsync = async (
    paths: readonly string[],
  ): Promise<boolean> => {
    if (paths.length === 0) return true;
    // Whole-form scope: same delegation as validateFields (see above).
    if (paths.some((p) => p === "")) {
      const result = await validateAsyncOnForm();
      return result.kind === "valid";
    }
    const seqs = new Map(paths.map((p) => [p, nextSeq(p)]));
    const valuesAtStart = store.getState().values;
    store.setState((state) => ({
      ...state,
      isValidating: paths.reduce<Record<string, boolean>>(
        (acc, p) => ({ ...acc, [p]: true }),
        { ...state.isValidating },
      ),
    }));

    const result = await validateAsync(schema, valuesAtStart);
    const fullErrors = result.kind === "invalid" ? result.errors : emptyErrors;
    const requestedValid = Object.keys(fullErrors).every(
      (k) => !inScopeOfAny(k, paths),
    );

    const live = store.getState();
    const stillCurrent = paths.filter((p) => sequences.get(p) === seqs.get(p));
    if (live.values !== valuesAtStart) {
      if (stillCurrent.length > 0) {
        store.setState((state) => ({
          ...state,
          isValidating: stillCurrent.reduce(
            (acc, p) => omitKey(acc, p),
            state.isValidating,
          ),
        }));
      }
      return requestedValid;
    }

    store.setState((state) => ({
      ...state,
      ...errorChannels(state, {
        schemaErrors: reuseErrorRefs(
          mergeScopedErrors(
            state.schemaErrors,
            pickScope(fullErrors, stillCurrent),
            stillCurrent,
          ),
          state.schemaErrors,
        ),
        serverErrors: omitScope(state.serverErrors, stillCurrent),
      }),
      isValidating: stillCurrent.reduce(
        (acc, p) => omitKey(acc, p),
        state.isValidating,
      ),
    }));

    return requestedValid;
  };

  const validateFieldAsync = async (
    path: string,
  ): Promise<SettledFieldValidationResult> => {
    // The root "" is whole-form scope: delegate to the form-level pass so
    // the in-flight flag lands in isValidatingForm — the single slot for
    // whole-form validation — instead of booking an isValidating[""] entry
    // no consumer watches.
    if (path === "") {
      const result = await validateAsyncOnForm();
      return fieldResult(
        result.kind === "invalid" ? result.errors : emptyErrors,
      );
    }
    const seq = nextSeq(path);
    const valuesAtStart = store.getState().values;
    store.setState((state) => ({
      ...state,
      isValidating: { ...state.isValidating, [path]: true },
    }));

    const scoped = await scopedFieldErrorsAsync(path, valuesAtStart);

    const live = store.getState();
    const stillOwns = sequences.get(path) === seq;
    if (!stillOwns || live.values !== valuesAtStart) {
      if (stillOwns) {
        store.setState((state) => ({
          ...state,
          isValidating: omitKey(state.isValidating, path),
        }));
      }
      return fieldResult(scoped);
    }

    store.setState((state) => ({
      ...state,
      ...commitFieldErrors(state, scoped, path),
      isValidating: omitKey(state.isValidating, path),
    }));

    return fieldResult(scoped);
  };

  const applyArrayOp = (
    path: string,
    nextArray: (current: readonly unknown[]) => readonly unknown[],
    mapper: IndexMapper,
    // Validated against the current length before anything mutates — a bad
    // index (arrayRemove(path, -1)) would otherwise corrupt both the array
    // and the re-keyed error/touched maps.
    indexInBounds?: (length: number) => boolean,
  ): void => {
    const current = getAtPath(store.getState().values, path);
    if (current !== undefined && !Array.isArray(current)) {
      console.warn(
        `[formstand] array op on "${path}" but the value at that path is not an array (got ${typeof current}). Operation skipped.`,
      );
      return;
    }
    const length = Array.isArray(current) ? current.length : 0;
    if (indexInBounds !== undefined && !indexInBounds(length)) {
      console.warn(
        `[formstand] array op on "${path}" with an out-of-range or non-integer index (length ${length}). Operation skipped.`,
      );
      return;
    }
    store.setState((state) => {
      const live = getAtPath(state.values, path);
      const arr: readonly unknown[] = Array.isArray(live) ? live : [];
      return {
        ...state,
        values: setAtPath(state.values, path, nextArray(arr)),
        ...errorChannels(state, {
          schemaErrors: reKeyByArrayPath(state.schemaErrors, path, mapper),
          // Server entries on rows follow their rows through the index
          // mapping — a verdict on "items.1.name" is still vouched for after
          // the op moves it to "items.0.name" (that row's value didn't
          // change). Entries at the array itself or an ancestor release: the
          // op changed that value.
          serverErrors: releaseAncestorEntries(
            reKeyByArrayPath(state.serverErrors, path, mapper),
            path,
          ),
        }),
        touched: reKeyByArrayPath(state.touched, path, mapper),
        // Drop (don't re-key) in-flight flags under the array: the op changes
        // `values`, so every pass they belong to fails its values-changed
        // guard and never commits — but each pass's cleanup omits its
        // ORIGINAL key, so a re-keyed entry would be orphaned and stick
        // forever. Dropped, the flag is gone now and the cleanup is a
        // harmless no-op.
        isValidating: omitScope(state.isValidating, [path]),
      };
    });
  };

  const inFlight: { count: number; baseline: boolean } = {
    count: 0,
    baseline: false,
  };

  const submit = async (
    onValid: SubmitHandler<TSchema>,
    onInvalid?: InvalidSubmitHandler,
    submitOptions?: SubmitOptions,
  ): Promise<SubmitResult<z.output<TSchema>>> => {
    if (inFlight.count > 0 && submitOptions?.force !== true) {
      return { kind: "skipped" };
    }
    if (inFlight.count === 0) {
      inFlight.baseline = store.getState().isSubmitting;
    }
    inFlight.count += 1;
    store.setState((state) => ({
      ...state,
      isSubmitting: true,
      submitCount: state.submitCount + 1,
    }));

    try {
      const valuesAtStart = store.getState().values;
      const result = await validateAsync(schema, valuesAtStart);

      // Stale-commit contract (mirrors validateAsyncOnForm's guard): if the
      // values changed while validation was in flight (setValue/reset/
      // adoptValues), the verdict describes a snapshot the form no longer
      // holds — skip every state write (no error commit, no touched marks;
      // that state belongs to the new values). The handlers still run and
      // the result still reports the snapshot's verdict, so callers decide
      // what it means for them.
      const staleValues = store.getState().values !== valuesAtStart;

      if (result.kind === "invalid") {
        if (!staleValues) {
          store.setState((state) => {
            const committed = commitFullPass(state, result.errors);
            return {
              ...state,
              ...committed,
              // Mark every errored field touched so touched-gated error UIs
              // show something after the canonical first failed submit. The
              // "" key (schema-level refine) has no field to touch.
              touched: {
                ...state.touched,
                ...Object.fromEntries(
                  Object.keys(committed.errors)
                    .filter((k) => k !== "")
                    .map((k) => [k, true]),
                ),
              },
            };
          });
        }
        const merged = staleValues ? result.errors : store.getState().errors;
        onInvalid?.(merged);
        return { kind: "invalid", errors: merged };
      }

      if (!staleValues) {
        store.setState((state) => ({
          ...state,
          ...commitFullPass(state, emptyErrors),
        }));
      }
      try {
        await onValid(result.data);
      } catch (error) {
        // A throwing onValid is the caller's failure, not a validation
        // verdict: resolve with it (so handleSubmit-as-event-handler never
        // leaves an unhandled rejection) and write no error state.
        return { kind: "error", error };
      }
      return { kind: "valid", data: result.data };
    } finally {
      inFlight.count -= 1;
      if (inFlight.count === 0) {
        const baseline = inFlight.baseline;
        store.setState((state) => ({ ...state, isSubmitting: baseline }));
      }
    }
  };

  if (options.validateOnMount === true) {
    // Async schemas route themselves: validate() returns a "pending" result
    // whose background pass writes the error map when it settles.
    validate();
  }

  return Object.freeze({
    schema,
    store,
    getState: store.getState,
    subscribe: store.subscribe,
    getField: <P extends FieldPath<z.input<TSchema>>>(path: P) =>
      getAtPath(store.getState().values, path) as FieldValue<
        z.input<TSchema>,
        P
      >,
    getFieldState: <P extends FieldPath<z.input<TSchema>>>(path: P) =>
      snapshotField(store.getState(), path) as FieldSnapshot<
        FieldValue<z.input<TSchema>, P>
      >,
    watchField: <P extends FieldPath<z.input<TSchema>>>(
      path: P,
      listener: (snapshot: FieldSnapshot<FieldValue<z.input<TSchema>, P>>) => void,
    ) => {
      const ref: { current: FieldSnapshot<unknown> } = {
        current: snapshotField(store.getState(), path),
      };
      return store.subscribe((state) => {
        const next = snapshotField(state, path);
        if (!shallowFieldEqual(ref.current, next)) {
          ref.current = next;
          listener(next as FieldSnapshot<FieldValue<z.input<TSchema>, P>>);
        }
      });
    },
    watchValue: <P extends FieldPath<z.input<TSchema>>>(
      path: P,
      listener: (
        value: FieldValue<z.input<TSchema>, P>,
        previous: FieldValue<z.input<TSchema>, P>,
      ) => void,
    ) => {
      const ref: { current: unknown } = {
        current: getAtPath(store.getState().values, path),
      };
      return store.subscribe((state) => {
        const next = getAtPath(state.values, path);
        if (!Object.is(ref.current, next)) {
          const prev = ref.current;
          ref.current = next;
          listener(
            next as FieldValue<z.input<TSchema>, P>,
            prev as FieldValue<z.input<TSchema>, P>,
          );
        }
      });
    },
    watchValues: (listener) => {
      const ref: { current: Values } = { current: store.getState().values };
      return store.subscribe((state) => {
        if (state.values !== ref.current) {
          const prev = ref.current;
          ref.current = state.values;
          listener(state.values, prev);
        }
      });
    },
    setValue: (path: string, value: unknown) =>
      store.setState((state) => ({
        ...state,
        values: setAtPath(state.values, path, value),
        ...errorChannels(state, {
          serverErrors: releaseSpine(state.serverErrors, path),
        }),
      })),
    setValues: (next) =>
      store.setState((state) => ({
        ...state,
        values: next,
        ...errorChannels(state, {
          serverErrors: releaseChangedSlices(
            state.serverErrors,
            state.values,
            next,
          ),
        }),
      })),
    setTouched: (path: string, touched: boolean = true) =>
      store.setState((state) => ({
        ...state,
        touched: { ...state.touched, [path]: touched },
      })),
    setSubmitting: (value) =>
      store.setState((state) => ({ ...state, isSubmitting: value })),
    setMode: (mode) => store.setState((state) => ({ ...state, mode })),
    setReValidateMode: (reValidateMode) =>
      store.setState((state) => ({ ...state, reValidateMode })),
    setError: (path: string, errors: string | readonly string[]) => {
      const list = typeof errors === "string" ? [errors] : errors;
      store.setState((state) => ({
        ...state,
        ...errorChannels(state, {
          serverErrors:
            list.length === 0
              ? omitKey(state.serverErrors, path)
              : { ...state.serverErrors, [path]: list },
        }),
      }));
    },
    setErrors: (errors) =>
      store.setState((state) => ({
        ...state,
        ...errorChannels(state, { serverErrors: errors }),
      })),
    clearErrors: (path?: string) =>
      store.setState((state) => {
        // Clears both channels (schema errors return on the next validation
        // pass). A field path also clears its descendants ("items" covers
        // "items.0.name"), consistent with field-scoped validation; the root
        // "" is a single key (the schema-level refine slot, symmetric with
        // setError("")); clearing everything is clearErrors() with no
        // argument.
        const scrub = (map: ErrorMap): ErrorMap =>
          path === undefined ? emptyErrors : omitScope(map, [path]);
        return {
          ...state,
          ...errorChannels(state, {
            schemaErrors: scrub(state.schemaErrors),
            serverErrors: scrub(state.serverErrors),
          }),
        };
      }),
    updateState: (updater) =>
      store.setState((state) => {
        const patch: Partial<FormState<Values>> = updater(state);
        if (Object.keys(patch).length === 0) return state;
        // Spread-style updaters carry `errors` with its current reference —
        // only a genuinely foreign map (a plain-JS write; TS forbids it via
        // the patch type) earns the warning.
        if (patch.errors !== undefined && patch.errors !== state.errors) {
          console.warn(
            "[formstand] `errors` is derived from schemaErrors/serverErrors — patch those channels instead; the direct `errors` patch is ignored.",
          );
        }
        // Re-derive against the CURRENT merged map (not the patched one), so
        // an ignored `errors` patch can't leak even its object identity into
        // state and re-fire identity-based subscribers.
        const next = { ...state, ...patch };
        return {
          ...next,
          ...errorChannels(state, {
            schemaErrors: next.schemaErrors,
            serverErrors: next.serverErrors,
          }),
        };
      }),
    adoptValues: (values) => {
      // Rebasing values invalidates any in-flight async validation (the
      // values-reference guard drops its write), so the per-path sequence
      // counters can be released too rather than growing without bound.
      sequences.clear();
      store.setState((state) => ({
        ...state,
        values,
        initialValues: values,
        ...errorChannels(state, {
          schemaErrors: emptyErrors,
          serverErrors: emptyErrors,
        }),
        // Clearing `sequences` disowns every in-flight pass, including its
        // flag cleanup (the ownership check fails, so it never writes) —
        // clear the flags here too, mirroring reset(), or they'd stick.
        isValidating: emptyBools,
        isValidatingForm: false,
      }));
    },
    reset: (nextInitial, resetOptions) => {
      sequences.clear();
      store.setState((state) => {
        // Merge only when both sides are plain records; a partial for an
        // array/scalar-rooted schema replaces wholesale (spreading an array
        // into {...} would corrupt the values shape).
        const init: typeof state.initialValues =
          nextInitial === undefined
            ? state.initialValues
            : isPlainObject(state.initialValues) && isPlainObject(nextInitial)
              ? ({
                  ...state.initialValues,
                  ...nextInitial,
                } as typeof state.initialValues)
              : (nextInitial as typeof state.initialValues);
        return {
          ...state,
          values: init,
          initialValues: init,
          ...(resetOptions?.keepErrors === true
            ? {}
            : errorChannels(state, {
                schemaErrors: emptyErrors,
                serverErrors: emptyErrors,
              })),
          touched:
            resetOptions?.keepTouched === true ? state.touched : emptyBools,
          isSubmitting: false,
          submitCount:
            resetOptions?.keepSubmitCount === true ? state.submitCount : 0,
          isValidating: emptyBools,
          isValidatingForm: false,
        };
      });
    },
    resetField: (path: string) =>
      store.setState((state) => ({
        ...state,
        values: setAtPath(
          state.values,
          path,
          getAtPath(state.initialValues, path),
        ),
        // A runtime "" path scopes the whole form (the imperative surface is
        // string-typed even though FieldPath excludes ""). Server entries
        // follow the setValue release contract (releaseSpine).
        ...errorChannels(state, {
          schemaErrors:
            path === "" ? emptyErrors : omitScope(state.schemaErrors, [path]),
          serverErrors: releaseSpine(state.serverErrors, path),
        }),
        touched:
          path === "" ? emptyBools : omitScope(state.touched, [path]),
        isValidating:
          path === "" ? emptyBools : omitScope(state.isValidating, [path]),
      })),
    validate,
    validateField,
    validateFields,
    validateAsync: validateAsyncOnForm,
    validateFieldAsync,
    validateFieldsAsync,
    submit,
    arrayPush: (path: string, item: unknown) =>
      applyArrayOp(path, (arr) => [...arr, item], identityMapper),
    arrayRemove: (path: string, index: number) =>
      applyArrayOp(
        path,
        (arr) => [...arr.slice(0, index), ...arr.slice(index + 1)],
        removeAt(index),
        (len) => Number.isInteger(index) && index >= 0 && index < len,
      ),
    arrayInsert: (path: string, index: number, item: unknown) =>
      applyArrayOp(
        path,
        (arr) => [...arr.slice(0, index), item, ...arr.slice(index)],
        insertAt(index),
        (len) => Number.isInteger(index) && index >= 0 && index <= len,
      ),
    arrayMove: (path: string, from: number, to: number) =>
      applyArrayOp(
        path,
        (arr) => {
          const without = [...arr.slice(0, from), ...arr.slice(from + 1)];
          return [...without.slice(0, to), arr[from], ...without.slice(to)];
        },
        moveFromTo(from, to),
        (len) =>
          Number.isInteger(from) &&
          Number.isInteger(to) &&
          from >= 0 &&
          from < len &&
          to >= 0 &&
          to < len,
      ),
    arraySwap: (path: string, a: number, b: number) =>
      applyArrayOp(
        path,
        (arr) => arr.map((v, i) => (i === a ? arr[b] : i === b ? arr[a] : v)),
        swapIndices(a, b),
        (len) =>
          Number.isInteger(a) &&
          Number.isInteger(b) &&
          a >= 0 &&
          a < len &&
          b >= 0 &&
          b < len,
      ),
    handleSubmit:
      (onValid, onInvalid, opts) =>
      async (event) => {
        event?.preventDefault();
        return submit(onValid, onInvalid, opts);
      },
    diff: () => {
      const state = store.getState();
      return Object.fromEntries(
        dirtyPathsOf(state.values, state.initialValues, "").map((path) => [
          path,
          getAtPath(state.values, path),
        ]),
      );
    },
    dirtyFields: () => {
      const state = store.getState();
      return dirtyPathsOf(state.values, state.initialValues, "");
    },
    snapshot: () => store.getState(),
    restore: (snap) =>
      store.setState(() => {
        // Snapshots can come from persistence or hand construction: default
        // missing channels (pre-channel shapes) and re-derive the merged map
        // so the errors-is-derived invariant holds at this boundary too —
        // otherwise an inconsistent snapshot renders phantom errors until
        // the next write silently rewrites them (or crashes a channel scan).
        const schemaErrors = snap.schemaErrors ?? emptyErrors;
        const serverErrors = snap.serverErrors ?? emptyErrors;
        return {
          ...snap,
          schemaErrors,
          serverErrors,
          errors: reuseErrorRefs(
            mergeErrorChannels(schemaErrors, serverErrors),
            snap.errors ?? emptyErrors,
          ),
        };
      }),
  }) as Form<TSchema>;
};
