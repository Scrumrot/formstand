import type { z } from "zod";
import { createStore } from "zustand/vanilla";
import { setAtPath } from "./path";
import type { FormState } from "./types";

export type CreateFormOptions<TSchema extends z.ZodType> = Readonly<{
  initialValues: z.input<TSchema>;
}>;

export type Form<TSchema extends z.ZodType> = Readonly<{
  schema: TSchema;
  getState: () => FormState<z.input<TSchema>>;
  subscribe: (
    listener: (
      state: FormState<z.input<TSchema>>,
      prev: FormState<z.input<TSchema>>,
    ) => void,
  ) => () => void;
  setValue: (path: string, value: unknown) => void;
  setValues: (next: z.input<TSchema>) => void;
  reset: (nextInitial?: z.input<TSchema>) => void;
}>;

const emptyErrors = {} as Readonly<Record<string, readonly string[]>>;
const emptyBools = {} as Readonly<Record<string, boolean>>;

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

  return Object.freeze({
    schema,
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
  });
};
