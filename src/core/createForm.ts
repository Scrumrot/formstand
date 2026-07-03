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
import { arrayIndicesInBounds, getAtPath, setAtPath } from "./path";
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

// "valid": validation passed and onValid ran. "invalid": validation failed
// (onInvalid ran, errors written and their fields marked touched).
// "skipped": another submit was already in flight and force wasn't set.
export type SubmitResult<TOutput> =
  | Readonly<{ kind: "valid"; data: TOutput }>
  | Readonly<{ kind: "invalid"; errors: ErrorMap }>
  | Readonly<{ kind: "skipped" }>;

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
  updateState: (
    updater: (
      state: FormState<z.input<TSchema>>,
    ) => Partial<FormState<z.input<TSchema>>>,
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

// Drop manual marks at `path` itself or an ancestor of it ("a" over "a.b").
// The root "" mark is an ancestor of every path, so any value write releases
// it — a value write below a container stales the container-level server
// verdict too, per the documented release contract.
const releaseAncestorMarks = (manual: BoolMap, path: string): BoolMap => {
  const entries = Object.entries(manual);
  const kept = entries.filter(([k]) => k !== "" && !isPathOrChild(path, k));
  return kept.length === entries.length ? manual : Object.fromEntries(kept);
};

// `setValues` replaces the whole values object, so per-path dirtiness written
// by earlier `setValue` calls can't be carried over; recompute at top-level-key
// granularity (or a single "" entry for non-record roots).
const computeDirtyMap = (values: unknown, initialValues: unknown): BoolMap => {
  if (isPlainObject(values) && isPlainObject(initialValues)) {
    const keys = new Set([
      ...Object.keys(values),
      ...Object.keys(initialValues),
    ]);
    const dirtyKeys = [...keys].filter(
      (k) => !valuesEqual(values[k], initialValues[k]),
    );
    return dirtyKeys.length === 0
      ? emptyBools
      : Object.fromEntries(dirtyKeys.map((k) => [k, true]));
  }
  return valuesEqual(values, initialValues) ? emptyBools : { "": true };
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

// Merge still-marked manual entries (setError/setErrors/updateState writes)
// into a freshly computed full-form error map. Also prunes marks whose entry
// vanished (restore/clearErrors) and marks superseded by a schema error at
// the same key.
const preserveManualErrors = (
  next: ErrorMap,
  current: ErrorMap,
  manual: BoolMap,
): Readonly<{ errors: ErrorMap; manualErrors: BoolMap }> => {
  const kept = Object.keys(manual).flatMap(
    (k): readonly (readonly [string, readonly string[]])[] => {
      const entry = current[k];
      return entry !== undefined && next[k] === undefined ? [[k, entry]] : [];
    },
  );
  return {
    errors:
      kept.length === 0 ? next : { ...next, ...Object.fromEntries(kept) },
    manualErrors:
      kept.length === Object.keys(manual).length
        ? manual
        : Object.fromEntries(kept.map(([k]) => [k, true])),
  };
};

// The one way a full validation pass lands its error map: manual entries are
// preserved (and stale marks pruned) before per-key refs are reused so
// identity-based subscribers don't re-fire.
const commitFullPassErrors = (
  state: Readonly<{ errors: ErrorMap; manualErrors: BoolMap }>,
  next: ErrorMap,
): Readonly<{ errors: ErrorMap; manualErrors: BoolMap }> => {
  const preserved = preserveManualErrors(
    next,
    state.errors,
    state.manualErrors,
  );
  return {
    errors: reuseErrorRefs(preserved.errors, state.errors),
    manualErrors: preserved.manualErrors,
  };
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
    touched: emptyBools,
    dirty: emptyBools,
    manualErrors: emptyBools,
    isSubmitting: false,
    submitCount: 0,
    isValidating: emptyBools,
    isValidatingForm: false,
    mode: initialMode,
    reValidateMode: initialReValidateMode,
  };

  const store = createStore<FormState<Values>>(() => initial);

  const validate = (): ValidationResult<z.output<TSchema>> => {
    try {
      const result = validateSync(schema, store.getState().values);
      store.setState((state) => ({
        ...state,
        ...commitFullPassErrors(
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
    try {
      const result = validateSync(schema, store.getState().values);
      const fullErrors =
        result.kind === "invalid" ? result.errors : emptyErrors;
      store.setState((state) => ({
        ...state,
        errors: reuseErrorRefs(
          mergeScopedErrors(state.errors, pickScope(fullErrors, paths), paths),
          state.errors,
        ),
        manualErrors: omitScope(state.manualErrors, paths),
      }));
      return Object.keys(fullErrors).every((k) => !inScopeOfAny(k, paths));
    } catch (e) {
      if (isAsyncRequiredError(e)) return validateFieldsAsync(paths);
      throw e;
    }
  };

  // How to validate one field: through its extracted subschema when the path
  // is reachable through check-free objects/arrays, via a full-form parse
  // filtered to the path's scope otherwise (so cross-field refinements
  // targeting the path still land), or not at all when the path addresses no
  // slot (an out-of-range array index — parsing the subschema against
  // undefined would fabricate an error no full-form parse produces). Shared
  // by the sync and async passes so their decisions cannot diverge.
  type FieldScope =
    | Readonly<{ kind: "skip" }>
    | Readonly<{ kind: "full" }>
    | Readonly<{ kind: "sub"; schema: z.ZodType; value: unknown }>;

  const fieldScopeFor = (path: string, values: Values): FieldScope => {
    const sub = path === "" ? null : fieldSchemaAtPath(schema, path);
    if (sub === null) return { kind: "full" };
    if (!arrayIndicesInBounds(values, path)) return { kind: "skip" };
    return { kind: "sub", schema: sub, value: getAtPath(values, path) };
  };

  const scopedFieldErrors = (path: string): ErrorMap => {
    const values = store.getState().values;
    const scope = fieldScopeFor(path, values);
    switch (scope.kind) {
      case "skip":
        return emptyErrors;
      case "full":
        return scopeSettledResult(validateSync(schema, values), path, false);
      case "sub":
        return scopeSettledResult(
          validateSync(scope.schema, scope.value),
          path,
          true,
        );
    }
  };

  const scopedFieldErrorsAsync = async (
    path: string,
    values: Values,
  ): Promise<ErrorMap> => {
    const scope = fieldScopeFor(path, values);
    switch (scope.kind) {
      case "skip":
        return emptyErrors;
      case "full":
        return scopeSettledResult(await validateAsync(schema, values), path, false);
      case "sub":
        return scopeSettledResult(
          await validateAsync(scope.schema, scope.value),
          path,
          true,
        );
    }
  };

  const fieldResult = (scoped: ErrorMap): SettledFieldValidationResult => {
    const messages = Object.values(scoped).flat();
    return messages.length === 0
      ? { kind: "valid" }
      : { kind: "invalid", errors: messages };
  };

  // How a field validation's scoped errors land in state. validateField("")
  // is a whole-form pass, so it lands like validate(): manual entries
  // preserved. A real field path releases its own marks — a validation
  // explicitly targeting them supersedes the server verdict. Shared by the
  // sync and async passes so their commit semantics cannot diverge.
  const commitFieldErrors = (
    state: FormState<Values>,
    scoped: ErrorMap,
    path: string,
  ): Readonly<{ errors: ErrorMap; manualErrors: BoolMap }> =>
    path === ""
      ? commitFullPassErrors(state, scoped)
      : {
          errors: reuseErrorRefs(
            mergeScopedErrors(state.errors, scoped, [path]),
            state.errors,
          ),
          manualErrors: omitScope(state.manualErrors, [path]),
        };

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

  const nextSeq = (key: string): number => {
    const next = (sequences.get(key) ?? 0) + 1;
    sequences.set(key, next);
    return next;
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
      ...commitFullPassErrors(
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
      errors: reuseErrorRefs(
        mergeScopedErrors(
          state.errors,
          pickScope(fullErrors, stillCurrent),
          stillCurrent,
        ),
        state.errors,
      ),
      manualErrors: omitScope(state.manualErrors, stillCurrent),
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
        `[zustand-forms] array op on "${path}" but the value at that path is not an array (got ${typeof current}). Operation skipped.`,
      );
      return;
    }
    const length = Array.isArray(current) ? current.length : 0;
    if (indexInBounds !== undefined && !indexInBounds(length)) {
      console.warn(
        `[zustand-forms] array op on "${path}" with an out-of-range or non-integer index (length ${length}). Operation skipped.`,
      );
      return;
    }
    store.setState((state) => {
      const live = getAtPath(state.values, path);
      const arr: readonly unknown[] = Array.isArray(live) ? live : [];
      const next = nextArray(arr);
      const reKeyedDirty = reKeyByArrayPath(state.dirty, path, mapper);
      const matchesInitial = valuesEqual(
        next,
        getAtPath(state.initialValues, path),
      );
      return {
        ...state,
        values: setAtPath(state.values, path, next),
        errors: reKeyByArrayPath(state.errors, path, mapper),
        touched: reKeyByArrayPath(state.touched, path, mapper),
        // The op changed the array itself, so dirtiness of the base path is
        // recomputed against the initial value (push then remove reverts to
        // clean); per-item dirty keys just re-key with the indices.
        dirty: matchesInitial
          ? omitKey(reKeyedDirty, path)
          : { ...reKeyedDirty, [path]: true },
        // Manual marks on rows follow their error entries through the index
        // mapping — a server error on "items.1.name" is still vouched for
        // after the op moves it to "items.0.name" (that row's value didn't
        // change). Marks at the array itself or an ancestor release: the op
        // changed that value.
        manualErrors: releaseAncestorMarks(
          reKeyByArrayPath(state.manualErrors, path, mapper),
          path,
        ),
        isValidating: reKeyByArrayPath(state.isValidating, path, mapper),
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
      const result = await validateAsync(schema, store.getState().values);

      if (result.kind === "invalid") {
        const committed = commitFullPassErrors(store.getState(), result.errors);
        store.setState((state) => ({
          ...state,
          ...committed,
          // Mark every errored field touched so touched-gated error UIs show
          // something after the canonical first failed submit. The "" key
          // (schema-level refine) has no field to touch.
          touched: {
            ...state.touched,
            ...Object.fromEntries(
              Object.keys(committed.errors)
                .filter((k) => k !== "")
                .map((k) => [k, true]),
            ),
          },
        }));
        onInvalid?.(committed.errors);
        return { kind: "invalid", errors: committed.errors };
      }

      store.setState((state) => ({
        ...state,
        ...commitFullPassErrors(state, emptyErrors),
      }));
      await onValid(result.data);
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
    setValue: (path: string, value: unknown) => {
      store.setState((state) => {
        const matchesInitial = valuesEqual(
          value,
          getAtPath(state.initialValues, path),
        );
        return {
          ...state,
          values: setAtPath(state.values, path, value),
          dirty: matchesInitial
            ? omitKey(state.dirty, path)
            : { ...state.dirty, [path]: true },
          // The value changed, so server-set errors on this path's spine —
          // the path itself, its descendants (subtree replaced), and its
          // ancestors (container verdicts) — are no longer vouched for; the
          // next validation pass owns them again.
          manualErrors: releaseAncestorMarks(
            omitScope(state.manualErrors, [path]),
            path,
          ),
        };
      });
    },
    setValues: (next) =>
      store.setState((state) => ({
        ...state,
        values: next,
        dirty: computeDirtyMap(next, state.initialValues),
        manualErrors: emptyBools,
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
        errors:
          list.length === 0
            ? omitKey(state.errors, path)
            : { ...state.errors, [path]: list },
        manualErrors:
          list.length === 0
            ? omitKey(state.manualErrors, path)
            : { ...state.manualErrors, [path]: true },
      }));
    },
    setErrors: (errors) =>
      store.setState((state) => ({
        ...state,
        errors,
        manualErrors: Object.fromEntries(
          Object.keys(errors).map((k) => [k, true]),
        ),
      })),
    clearErrors: (path?: string) =>
      store.setState((state) => ({
        ...state,
        // Clearing a field path also clears its descendants ("items" covers
        // "items.0.name"), consistent with field-scoped validation. The root
        // "" is a single key (the schema-level refine slot, symmetric with
        // setError("")); clearing everything is clearErrors() with no
        // argument.
        errors:
          path === undefined ? emptyErrors : omitScope(state.errors, [path]),
        manualErrors:
          path === undefined
            ? emptyBools
            : omitScope(state.manualErrors, [path]),
      })),
    updateState: (updater) =>
      store.setState((state) => {
        const patch = updater(state);
        if (Object.keys(patch).length === 0) return state;
        const next = { ...state, ...patch };
        // Errors written through this escape hatch get the setError contract
        // (they survive background validation until the field changes):
        // entries the patch added or replaced are marked manual, entries it
        // removed are unmarked. A patch that manages manualErrors itself
        // opts out.
        if (
          patch.errors === undefined ||
          patch.errors === state.errors ||
          patch.manualErrors !== undefined
        ) {
          return next;
        }
        const survivors = Object.keys(state.manualErrors).filter(
          (k) => next.errors[k] !== undefined,
        );
        // Content comparison, not reference: an updater that clones the
        // error map (structuredClone, entries-map) must not turn schema
        // errors into manual ones.
        const written = Object.keys(next.errors).filter((k) => {
          const prev = state.errors[k];
          const entry = next.errors[k];
          return (
            prev === undefined ||
            entry === undefined ||
            !stringArraysEqual(prev, entry)
          );
        });
        return {
          ...next,
          manualErrors: Object.fromEntries(
            [...survivors, ...written].map((k) => [k, true]),
          ),
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
        errors: emptyErrors,
        dirty: emptyBools,
        manualErrors: emptyBools,
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
          errors: resetOptions?.keepErrors === true ? state.errors : emptyErrors,
          manualErrors:
            resetOptions?.keepErrors === true
              ? state.manualErrors
              : emptyBools,
          touched:
            resetOptions?.keepTouched === true ? state.touched : emptyBools,
          dirty: emptyBools,
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
        errors: omitScope(state.errors, [path]),
        touched: omitScope(state.touched, [path]),
        dirty: omitScope(state.dirty, [path]),
        // Same release contract as setValue: the value at this path changed,
        // so ancestor-level server verdicts are stale too.
        manualErrors: releaseAncestorMarks(
          omitScope(state.manualErrors, [path]),
          path,
        ),
        isValidating: omitScope(state.isValidating, [path]),
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
        Object.keys(state.dirty)
          .filter((path) => state.dirty[path] === true)
          .map((path) => [path, getAtPath(state.values, path)]),
      );
    },
    dirtyFields: () => {
      const state = store.getState();
      return Object.keys(state.dirty).filter(
        (path) => state.dirty[path] === true,
      );
    },
    snapshot: () => store.getState(),
    restore: (snap) => store.setState(() => snap),
  }) as Form<TSchema>;
};
