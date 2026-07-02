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
import type { FieldPath, FieldValue } from "./fieldPath";
import type { ValidationMode } from "./mode";
import { getAtPath, setAtPath } from "./path";
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

export type ResetOptions = Readonly<{
  keepErrors?: boolean;
  keepTouched?: boolean;
  keepDirty?: boolean;
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

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

// Structural equality used to decide whether a field still matches its initial
// value. Recurses into arrays and plain objects; Dates compare by timestamp
// (re-picking the same date must not leave the field permanently dirty);
// other exotic objects fall back to Object.is so a real change is never
// mistaken for "unchanged".
const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((k) => valuesEqual(a[k], b[k]))
    );
  }
  return false;
};

const emptyErrors = {} as ErrorMap;
const emptyBools = {} as BoolMap;

const identityMapper: IndexMapper = (n) => n;

const omitKey = <V>(
  map: Readonly<Record<string, V>>,
  key: string,
): Readonly<Record<string, V>> =>
  Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));

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
    isSubmitting: false,
    submitCount: 0,
    isValidating: emptyBools,
    isValidatingForm: false,
    mode: initialMode,
    reValidateMode: initialReValidateMode,
  };

  const store = createStore<FormState<Values>>(() => initial);

  // Paths whose current error entry came from setError/setErrors rather than
  // a schema pass. Full-form validation preserves these where the schema is
  // silent (so a background validateAsync can't wipe a "username taken"
  // server error); they unmark when the field's value changes, when a
  // field-scoped validation targets them, or when a schema error supersedes
  // them at the same key.
  const manualKeys = new Set<string>();

  const unmarkManualUnder = (path: string): void => {
    manualKeys.forEach((k) => {
      if (isPathOrChild(k, path)) manualKeys.delete(k);
    });
  };

  // Merge still-marked manual entries into a freshly computed full-form error
  // map. Also prunes marks whose entry vanished (restore/clearErrors) and
  // marks superseded by a schema error at the same key.
  const preserveManualErrors = (
    next: ErrorMap,
    current: ErrorMap,
  ): ErrorMap => {
    const kept = [...manualKeys].flatMap(
      (k): readonly (readonly [string, readonly string[]])[] => {
        const entry = current[k];
        if (entry === undefined || next[k] !== undefined) {
          manualKeys.delete(k);
          return [];
        }
        return [[k, entry]];
      },
    );
    return kept.length === 0
      ? next
      : { ...next, ...Object.fromEntries(kept) };
  };

  const validate = (): ValidationResult<z.output<TSchema>> => {
    try {
      const result = validateSync(schema, store.getState().values);
      store.setState((state) => ({
        ...state,
        errors: reuseErrorRefs(
          preserveManualErrors(
            result.kind === "invalid" ? result.errors : emptyErrors,
            state.errors,
          ),
          state.errors,
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
      const inScope = (key: string): boolean =>
        paths.some((p) => isPathOrChild(key, p));
      paths.forEach(unmarkManualUnder);
      store.setState((state) => ({
        ...state,
        errors: reuseErrorRefs(
          {
            ...Object.fromEntries(
              Object.entries(state.errors).filter(([k]) => !inScope(k)),
            ),
            ...Object.fromEntries(
              Object.entries(fullErrors).filter(([k]) => inScope(k)),
            ),
          },
          state.errors,
        ),
      }));
      return Object.keys(fullErrors).every((k) => !inScope(k));
    } catch (e) {
      if (isAsyncRequiredError(e)) return validateFieldsAsync(paths);
      throw e;
    }
  };

  // Errors for `path` and its descendants, keyed by absolute form path. Parses
  // just the field's subschema when the path is reachable through check-free
  // objects/arrays; otherwise falls back to a full-form parse filtered to the
  // path's scope (so cross-field refinements targeting the path still land).
  const scopedFieldErrors = (path: string): ErrorMap => {
    const values = store.getState().values;
    const sub = path === "" ? null : fieldSchemaAtPath(schema, path);
    if (sub !== null) {
      const result = validateSync(sub, getAtPath(values, path));
      return result.kind === "invalid"
        ? prefixErrorKeys(result.errors, path)
        : emptyErrors;
    }
    const result = validateSync(schema, values);
    return result.kind === "invalid"
      ? Object.fromEntries(
          Object.entries(result.errors).filter(([k]) => isPathOrChild(k, path)),
        )
      : emptyErrors;
  };

  const scopedFieldErrorsAsync = async (
    path: string,
    values: Values,
  ): Promise<ErrorMap> => {
    const sub = path === "" ? null : fieldSchemaAtPath(schema, path);
    if (sub !== null) {
      const result = await validateAsync(sub, getAtPath(values, path));
      return result.kind === "invalid"
        ? prefixErrorKeys(result.errors, path)
        : emptyErrors;
    }
    const result = await validateAsync(schema, values);
    return result.kind === "invalid"
      ? Object.fromEntries(
          Object.entries(result.errors).filter(([k]) => isPathOrChild(k, path)),
        )
      : emptyErrors;
  };

  const fieldResult = (scoped: ErrorMap): SettledFieldValidationResult => {
    const messages = Object.values(scoped).flat();
    return messages.length === 0
      ? { kind: "valid" }
      : { kind: "invalid", errors: messages };
  };

  const validateField = (path: string): FieldValidationResult => {
    try {
      const scoped = scopedFieldErrors(path);
      unmarkManualUnder(path);
      store.setState((state) => ({
        ...state,
        errors: reuseErrorRefs(
          {
            ...Object.fromEntries(
              Object.entries(state.errors).filter(
                ([k]) => !isPathOrChild(k, path),
              ),
            ),
            ...scoped,
          },
          state.errors,
        ),
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
  ): FieldSnapshot<unknown> => ({
    value: getAtPath(state.values, path),
    error: state.errors[path],
    touched: state.touched[path] ?? false,
    dirty: state.dirty[path] ?? false,
    isValidating: state.isValidating[path] ?? false,
  });

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
      errors: reuseErrorRefs(
        preserveManualErrors(
          result.kind === "invalid" ? result.errors : emptyErrors,
          state.errors,
        ),
        state.errors,
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
    const inScopeOf = (key: string, ps: readonly string[]): boolean =>
      ps.some((p) => isPathOrChild(key, p));
    const requestedValid = Object.keys(fullErrors).every(
      (k) => !inScopeOf(k, paths),
    );

    const live = store.getState();
    if (live.values !== valuesAtStart) {
      const stillCurrent = paths.filter((p) => sequences.get(p) === seqs.get(p));
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

    const stillCurrent = paths.filter((p) => sequences.get(p) === seqs.get(p));

    stillCurrent.forEach(unmarkManualUnder);
    store.setState((state) => {
      const errors = reuseErrorRefs(
        {
          ...Object.fromEntries(
            Object.entries(state.errors).filter(
              ([k]) => !inScopeOf(k, stillCurrent),
            ),
          ),
          ...Object.fromEntries(
            Object.entries(fullErrors).filter(([k]) =>
              inScopeOf(k, stillCurrent),
            ),
          ),
        },
        state.errors,
      );
      const isValidating = stillCurrent.reduce(
        (acc, p) => omitKey(acc, p),
        state.isValidating,
      );
      return { ...state, errors, isValidating };
    });

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

    unmarkManualUnder(path);
    store.setState((state) => ({
      ...state,
      errors: reuseErrorRefs(
        {
          ...Object.fromEntries(
            Object.entries(state.errors).filter(
              ([k]) => !isPathOrChild(k, path),
            ),
          ),
          ...scoped,
        },
        state.errors,
      ),
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
    unmarkManualUnder(path);
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
        const merged = reuseErrorRefs(
          preserveManualErrors(result.errors, store.getState().errors),
          store.getState().errors,
        );
        store.setState((state) => ({
          ...state,
          errors: merged,
          // Mark every errored field touched so touched-gated error UIs show
          // something after the canonical first failed submit. The "" key
          // (schema-level refine) has no field to touch.
          touched: {
            ...state.touched,
            ...Object.fromEntries(
              Object.keys(merged)
                .filter((k) => k !== "")
                .map((k) => [k, true]),
            ),
          },
        }));
        onInvalid?.(merged);
        return { kind: "invalid", errors: merged };
      }

      store.setState((state) => ({
        ...state,
        errors: reuseErrorRefs(
          preserveManualErrors(emptyErrors, state.errors),
          state.errors,
        ),
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
      // The value changed, so any server-set error under this path is no
      // longer vouched for; the next validation pass owns it again.
      unmarkManualUnder(path);
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
        };
      });
    },
    setValues: (next) => {
      manualKeys.clear();
      store.setState((state) => ({
        ...state,
        values: next,
        dirty: computeDirtyMap(next, state.initialValues),
      }));
    },
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
      if (list.length === 0) {
        manualKeys.delete(path);
      } else {
        manualKeys.add(path);
      }
      store.setState((state) => ({
        ...state,
        errors:
          list.length === 0
            ? omitKey(state.errors, path)
            : { ...state.errors, [path]: list },
      }));
    },
    setErrors: (errors) => {
      manualKeys.clear();
      Object.keys(errors).forEach((k) => manualKeys.add(k));
      store.setState((state) => ({ ...state, errors }));
    },
    clearErrors: (path?: string) => {
      if (path === undefined) {
        manualKeys.clear();
      } else {
        unmarkManualUnder(path);
      }
      store.setState((state) => ({
        ...state,
        // Clearing a path also clears its descendants ("items" covers
        // "items.0.name"), consistent with field-scoped validation.
        errors:
          path === undefined
            ? emptyErrors
            : Object.fromEntries(
                Object.entries(state.errors).filter(
                  ([k]) => !isPathOrChild(k, path),
                ),
              ),
      }));
    },
    updateState: (updater) =>
      store.setState((state) => {
        const patch = updater(state);
        if (Object.keys(patch).length === 0) return state;
        return { ...state, ...patch };
      }),
    adoptValues: (values) => {
      // Rebasing values invalidates any in-flight async validation (the
      // values-reference guard drops its write), so the per-path sequence
      // counters can be released too rather than growing without bound.
      sequences.clear();
      manualKeys.clear();
      store.setState((state) => ({
        ...state,
        values,
        initialValues: values,
        errors: emptyErrors,
        dirty: emptyBools,
      }));
    },
    reset: (nextInitial, resetOptions) => {
      sequences.clear();
      if (resetOptions?.keepErrors !== true) manualKeys.clear();
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
          touched:
            resetOptions?.keepTouched === true ? state.touched : emptyBools,
          dirty: resetOptions?.keepDirty === true ? state.dirty : emptyBools,
          isSubmitting: false,
          submitCount:
            resetOptions?.keepSubmitCount === true ? state.submitCount : 0,
          isValidating: emptyBools,
          isValidatingForm: false,
        };
      });
    },
    resetField: (path: string) => {
      unmarkManualUnder(path);
      store.setState((state) => {
        const initialAtPath = getAtPath(state.initialValues, path);
        const scopedOut = <V>(
          map: Readonly<Record<string, V>>,
        ): Readonly<Record<string, V>> =>
          Object.fromEntries(
            Object.entries(map).filter(([k]) => !isPathOrChild(k, path)),
          );
        return {
          ...state,
          values: setAtPath(state.values, path, initialAtPath),
          errors: scopedOut(state.errors),
          touched: scopedOut(state.touched),
          dirty: scopedOut(state.dirty),
          isValidating: scopedOut(state.isValidating),
        };
      });
    },
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
