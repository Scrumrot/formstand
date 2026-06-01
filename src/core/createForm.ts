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
import { type ValidationMode } from "./mode";
import { getAtPath, setAtPath } from "./path";
import type { BoolMap, ErrorMap, FormState } from "./types";
import {
  type FieldValidationResult,
  type ValidationResult,
  validateAsync,
  validateSync,
} from "./validation";

export type CreateFormOptions<TSchema extends z.ZodType> = Readonly<{
  initialValues: z.input<TSchema>;
  mode?: ValidationMode;
  reValidateMode?: ValidationMode;
}>;

export type SubmitHandler<TSchema extends z.ZodType> = (
  data: z.output<TSchema>,
) => void | Promise<void>;

export type InvalidSubmitHandler = (errors: ErrorMap) => void;

export type Form<TSchema extends z.ZodType> = Readonly<{
  schema: TSchema;
  store: StoreApi<FormState<z.input<TSchema>>>;
  mode: ValidationMode;
  reValidateMode: ValidationMode;
  getState: () => FormState<z.input<TSchema>>;
  subscribe: (
    listener: (
      state: FormState<z.input<TSchema>>,
      prev: FormState<z.input<TSchema>>,
    ) => void,
  ) => () => void;
  setValue: (path: string, value: unknown) => void;
  setValues: (next: z.input<TSchema>) => void;
  setTouched: (path: string, touched?: boolean) => void;
  setSubmitting: (value: boolean) => void;
  reset: (nextInitial?: z.input<TSchema>) => void;
  validate: () => ValidationResult<z.output<TSchema>>;
  validateField: (path: string) => FieldValidationResult;
  validateAsync: () => Promise<ValidationResult<z.output<TSchema>>>;
  validateFieldAsync: (path: string) => Promise<FieldValidationResult>;
  submit: (
    onValid: SubmitHandler<TSchema>,
    onInvalid?: InvalidSubmitHandler,
  ) => Promise<void>;
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

  const mode: ValidationMode = options.mode ?? "onBlur";
  const reValidateMode: ValidationMode = options.reValidateMode ?? "onChange";

  const initial: FormState<Values> = {
    values: options.initialValues,
    initialValues: options.initialValues,
    errors: emptyErrors,
    touched: emptyBools,
    dirty: emptyBools,
    isSubmitting: false,
    submitCount: 0,
    isValidating: emptyBools,
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
    store.setState((state) => ({
      ...state,
      isValidating: { ...state.isValidating, [FORM_SEQ_KEY]: true },
    }));

    const result = await validateAsync(schema, store.getState().values);

    if (sequences.get(FORM_SEQ_KEY) !== seq) return result;

    store.setState((state) => ({
      ...state,
      errors: result.kind === "invalid" ? result.errors : emptyErrors,
      isValidating: omitKey(state.isValidating, FORM_SEQ_KEY),
    }));
    return result;
  };

  const validateFieldAsync = async (
    path: string,
  ): Promise<FieldValidationResult> => {
    const seq = nextSeq(path);
    store.setState((state) => ({
      ...state,
      isValidating: { ...state.isValidating, [path]: true },
    }));

    const result = await validateAsync(schema, store.getState().values);
    const errorsAtPath =
      result.kind === "invalid" ? (result.errors[path] ?? []) : [];

    if (sequences.get(path) !== seq) {
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
    store.setState((state) => {
      const current = getAtPath(state.values, path);
      const arr: readonly unknown[] = Array.isArray(current) ? current : [];
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

  const submit = async (
    onValid: SubmitHandler<TSchema>,
    onInvalid?: InvalidSubmitHandler,
  ): Promise<void> => {
    store.setState((state) => ({
      ...state,
      isSubmitting: true,
      submitCount: state.submitCount + 1,
    }));

    const result = await validateAsync(schema, store.getState().values);

    if (result.kind === "invalid") {
      store.setState((state) => ({
        ...state,
        errors: result.errors,
        isSubmitting: false,
      }));
      onInvalid?.(result.errors);
      return;
    }

    store.setState((state) => ({ ...state, errors: emptyErrors }));

    try {
      await onValid(result.data);
    } finally {
      store.setState((state) => ({ ...state, isSubmitting: false }));
    }
  };

  return Object.freeze({
    schema,
    store,
    mode,
    reValidateMode,
    getState: store.getState,
    subscribe: store.subscribe,
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
    reset: (nextInitial) =>
      store.setState((state) => {
        const init = nextInitial ?? state.initialValues;
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
    validateAsync: validateAsyncOnForm,
    validateFieldAsync,
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
