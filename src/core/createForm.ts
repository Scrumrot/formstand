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
  type ValidationResult,
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
}>;

export type SubmitHandler<TSchema extends z.ZodType> = (
  data: z.output<TSchema>,
) => void | Promise<void>;

export type InvalidSubmitHandler = (errors: ErrorMap) => void;

export type SubmitOptions = Readonly<{
  force?: boolean;
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
  setValue: (path: string, value: unknown) => void;
  setValues: (next: z.input<TSchema>) => void;
  setTouched: (path: string, touched?: boolean) => void;
  setSubmitting: (value: boolean) => void;
  setMode: (mode: ValidationMode) => void;
  setReValidateMode: (mode: ValidationMode) => void;
  setError: (path: string, errors: readonly string[]) => void;
  setErrors: (errors: ErrorMap) => void;
  clearErrors: (path?: string) => void;
  updateState: (
    updater: (
      state: FormState<z.input<TSchema>>,
    ) => Partial<FormState<z.input<TSchema>>>,
  ) => void;
  reset: (nextInitial?: Partial<z.input<TSchema>>) => void;
  adoptValues: (values: z.input<TSchema>) => void;
  validate: () => ValidationResult<z.output<TSchema>>;
  validateField: (path: string) => FieldValidationResult;
  validateFields: (paths: readonly string[]) => boolean;
  validateAsync: () => Promise<ValidationResult<z.output<TSchema>>>;
  validateFieldAsync: (path: string) => Promise<FieldValidationResult>;
  validateFieldsAsync: (paths: readonly string[]) => Promise<boolean>;
  submit: (
    onValid: SubmitHandler<TSchema>,
    onInvalid?: InvalidSubmitHandler,
    options?: SubmitOptions,
  ) => Promise<boolean>;
  arrayPush: (path: string, item: unknown) => void;
  arrayRemove: (path: string, index: number) => void;
  arrayInsert: (path: string, index: number, item: unknown) => void;
  arrayMove: (path: string, from: number, to: number) => void;
  arraySwap: (path: string, a: number, b: number) => void;
}>;

const emptyErrors = {} as ErrorMap;
const emptyBools = {} as BoolMap;

const identityMapper: IndexMapper = (n) => n;

const omitKey = <V>(
  map: Readonly<Record<string, V>>,
  key: string,
): Readonly<Record<string, V>> =>
  Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));

const FORM_SEQ_KEY = "__form__";

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
    mode: initialMode,
    reValidateMode: initialReValidateMode,
  };

  const store = createStore<FormState<Values>>(() => initial);

  const validate = (): ValidationResult<z.output<TSchema>> => {
    const result = validateSync(schema, store.getState().values);
    store.setState((state) => ({
      ...state,
      errors: result.kind === "invalid" ? result.errors : emptyErrors,
    }));
    return result;
  };

  const validateFields = (paths: readonly string[]): boolean => {
    if (paths.length === 0) return true;
    const result = validateSync(schema, store.getState().values);
    const fullErrors = result.kind === "invalid" ? result.errors : emptyErrors;
    const pathSet = new Set(paths);
    store.setState((state) => {
      const next = paths.reduce<Record<string, readonly string[]>>(
        (acc, path) => {
          const errs = fullErrors[path] ?? [];
          if (errs.length === 0) {
            return acc;
          }
          return { ...acc, [path]: errs };
        },
        Object.fromEntries(
          Object.entries(state.errors).filter(([k]) => !pathSet.has(k)),
        ),
      );
      return { ...state, errors: next };
    });
    return paths.every((p) => (fullErrors[p] ?? []).length === 0);
  };

  const validateField = (path: string): FieldValidationResult => {
    const result = validateSync(schema, store.getState().values);
    const errorsAtPath =
      result.kind === "invalid" ? (result.errors[path] ?? []) : [];

    store.setState((state) => ({
      ...state,
      errors:
        errorsAtPath.length === 0
          ? omitKey(state.errors, path)
          : { ...state.errors, [path]: errorsAtPath },
    }));

    return errorsAtPath.length === 0
      ? { kind: "valid" }
      : { kind: "invalid", errors: errorsAtPath };
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
    ValidationResult<z.output<TSchema>>
  > => {
    const seq = nextSeq(FORM_SEQ_KEY);
    const valuesAtStart = store.getState().values;
    store.setState((state) => ({
      ...state,
      isValidating: { ...state.isValidating, [FORM_SEQ_KEY]: true },
    }));

    const result = await validateAsync(schema, valuesAtStart);

    const live = store.getState();
    const stillOwns = sequences.get(FORM_SEQ_KEY) === seq;
    if (!stillOwns || live.values !== valuesAtStart) {
      if (stillOwns) {
        store.setState((state) => ({
          ...state,
          isValidating: omitKey(state.isValidating, FORM_SEQ_KEY),
        }));
      }
      return result;
    }

    store.setState((state) => ({
      ...state,
      errors: result.kind === "invalid" ? result.errors : emptyErrors,
      isValidating: omitKey(state.isValidating, FORM_SEQ_KEY),
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
    const pathSet = new Set(paths);

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
      return paths.every((p) => (fullErrors[p] ?? []).length === 0);
    }

    const stillCurrent = paths.filter((p) => sequences.get(p) === seqs.get(p));
    const stillCurrentSet = new Set(stillCurrent);

    store.setState((state) => {
      const errors = stillCurrent.reduce<Record<string, readonly string[]>>(
        (acc, path) => {
          const errs = fullErrors[path] ?? [];
          if (errs.length === 0) return acc;
          return { ...acc, [path]: errs };
        },
        Object.fromEntries(
          Object.entries(state.errors).filter(
            ([k]) => !pathSet.has(k) || !stillCurrentSet.has(k),
          ),
        ),
      );
      const isValidating = stillCurrent.reduce(
        (acc, p) => omitKey(acc, p),
        state.isValidating,
      );
      return { ...state, errors, isValidating };
    });

    return paths.every((p) => (fullErrors[p] ?? []).length === 0);
  };

  const validateFieldAsync = async (
    path: string,
  ): Promise<FieldValidationResult> => {
    const seq = nextSeq(path);
    const valuesAtStart = store.getState().values;
    store.setState((state) => ({
      ...state,
      isValidating: { ...state.isValidating, [path]: true },
    }));

    const result = await validateAsync(schema, valuesAtStart);
    const errorsAtPath =
      result.kind === "invalid" ? (result.errors[path] ?? []) : [];

    const live = store.getState();
    const stillOwns = sequences.get(path) === seq;
    if (!stillOwns || live.values !== valuesAtStart) {
      if (stillOwns) {
        store.setState((state) => ({
          ...state,
          isValidating: omitKey(state.isValidating, path),
        }));
      }
      return errorsAtPath.length === 0
        ? { kind: "valid" }
        : { kind: "invalid", errors: errorsAtPath };
    }

    store.setState((state) => ({
      ...state,
      errors:
        errorsAtPath.length === 0
          ? omitKey(state.errors, path)
          : { ...state.errors, [path]: errorsAtPath },
      isValidating: omitKey(state.isValidating, path),
    }));

    return errorsAtPath.length === 0
      ? { kind: "valid" }
      : { kind: "invalid", errors: errorsAtPath };
  };

  const applyArrayOp = (
    path: string,
    nextArray: (current: readonly unknown[]) => readonly unknown[],
    mapper: IndexMapper,
  ): void => {
    const current = getAtPath(store.getState().values, path);
    if (current !== undefined && !Array.isArray(current)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[zustand-forms] array op on "${path}" but the value at that path is not an array (got ${typeof current}). Operation skipped.`,
      );
      return;
    }
    store.setState((state) => {
      const live = getAtPath(state.values, path);
      const arr: readonly unknown[] = Array.isArray(live) ? live : [];
      return {
        ...state,
        values: setAtPath(state.values, path, nextArray(arr)),
        errors: reKeyByArrayPath(state.errors, path, mapper),
        touched: reKeyByArrayPath(state.touched, path, mapper),
        dirty: reKeyByArrayPath(state.dirty, path, mapper),
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
  ): Promise<boolean> => {
    if (inFlight.count > 0 && submitOptions?.force !== true) return false;
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
        store.setState((state) => ({ ...state, errors: result.errors }));
        onInvalid?.(result.errors);
        return true;
      }

      store.setState((state) => ({ ...state, errors: emptyErrors }));
      await onValid(result.data);
      return true;
    } finally {
      inFlight.count -= 1;
      if (inFlight.count === 0) {
        const baseline = inFlight.baseline;
        store.setState((state) => ({ ...state, isSubmitting: baseline }));
      }
    }
  };

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
    setValue: (path, value) =>
      store.setState((state) => ({
        ...state,
        values: setAtPath(state.values, path, value),
        dirty: { ...state.dirty, [path]: true },
      })),
    setValues: (next) =>
      store.setState((state) => ({ ...state, values: next })),
    setTouched: (path, touched = true) =>
      store.setState((state) => ({
        ...state,
        touched: { ...state.touched, [path]: touched },
      })),
    setSubmitting: (value) =>
      store.setState((state) => ({ ...state, isSubmitting: value })),
    setMode: (mode) => store.setState((state) => ({ ...state, mode })),
    setReValidateMode: (reValidateMode) =>
      store.setState((state) => ({ ...state, reValidateMode })),
    setError: (path, errors) =>
      store.setState((state) => ({
        ...state,
        errors:
          errors.length === 0
            ? omitKey(state.errors, path)
            : { ...state.errors, [path]: errors },
      })),
    setErrors: (errors) =>
      store.setState((state) => ({ ...state, errors })),
    clearErrors: (path) =>
      store.setState((state) => ({
        ...state,
        errors:
          path === undefined ? emptyErrors : omitKey(state.errors, path),
      })),
    updateState: (updater) =>
      store.setState((state) => {
        const patch = updater(state);
        if (Object.keys(patch).length === 0) return state;
        return { ...state, ...patch };
      }),
    adoptValues: (values) =>
      store.setState((state) => ({
        ...state,
        values,
        initialValues: values,
        errors: emptyErrors,
        dirty: emptyBools,
      })),
    reset: (nextInitial) =>
      store.setState((state) => {
        const init: typeof state.initialValues =
          nextInitial === undefined
            ? state.initialValues
            : ({
                ...(state.initialValues as object),
                ...(nextInitial as object),
              } as typeof state.initialValues);
        return {
          ...state,
          values: init,
          initialValues: init,
          errors: emptyErrors,
          touched: emptyBools,
          dirty: emptyBools,
          isSubmitting: false,
          submitCount: 0,
          isValidating: emptyBools,
        };
      }),
    validate,
    validateField,
    validateFields,
    validateAsync: validateAsyncOnForm,
    validateFieldAsync,
    validateFieldsAsync,
    submit,
    arrayPush: (path, item) =>
      applyArrayOp(path, (arr) => [...arr, item], identityMapper),
    arrayRemove: (path, index) =>
      applyArrayOp(
        path,
        (arr) => [...arr.slice(0, index), ...arr.slice(index + 1)],
        removeAt(index),
      ),
    arrayInsert: (path, index, item) =>
      applyArrayOp(
        path,
        (arr) => [...arr.slice(0, index), item, ...arr.slice(index)],
        insertAt(index),
      ),
    arrayMove: (path, from, to) =>
      applyArrayOp(
        path,
        (arr) => {
          const without = [...arr.slice(0, from), ...arr.slice(from + 1)];
          return [...without.slice(0, to), arr[from], ...without.slice(to)];
        },
        moveFromTo(from, to),
      ),
    arraySwap: (path, a, b) =>
      applyArrayOp(
        path,
        (arr) => arr.map((v, i) => (i === a ? arr[b] : i === b ? arr[a] : v)),
        swapIndices(a, b),
      ),
  });
};
