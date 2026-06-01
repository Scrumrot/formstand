import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import { setAtPath } from "./path";
import type { ErrorMap, FormState } from "./types";
import {
  type FieldValidationResult,
  type ValidationResult,
  validateSync,
} from "./validation";

export type CreateFormOptions<TSchema extends z.ZodType> = Readonly<{
  initialValues: z.input<TSchema>;
}>;

export type Form<TSchema extends z.ZodType> = Readonly<{
  schema: TSchema;
  store: StoreApi<FormState<z.input<TSchema>>>;
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
  reset: (nextInitial?: z.input<TSchema>) => void;
  validate: () => ValidationResult<z.output<TSchema>>;
  validateField: (path: string) => FieldValidationResult;
}>;

const emptyErrors = {} as ErrorMap;
const emptyBools = {} as Readonly<Record<string, boolean>>;

const omitKey = (errors: ErrorMap, key: string): ErrorMap =>
  Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key));

export const createForm = <TSchema extends z.ZodType>(
  schema: TSchema,
  options: CreateFormOptions<TSchema>,
): Form<TSchema> => {
  type Values = z.input<TSchema>;

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

  return Object.freeze({
    schema,
    store,
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
  });
};
