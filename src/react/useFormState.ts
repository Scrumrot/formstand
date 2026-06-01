import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import type { Form } from "../core/createForm";
import type { FormState } from "../core/types";

type ReadonlyStore<T> = Pick<
  StoreApi<T>,
  "getState" | "getInitialState" | "subscribe"
>;

export type FormStateApi = Readonly<{
  store: ReadonlyStore<FormState<unknown>>;
}>;

export function useFormState<TSchema extends z.ZodType, U>(
  form: Form<TSchema>,
  selector: (state: FormState<z.input<TSchema>>) => U,
): U;
// The `schema?: undefined` brand forces Form<TSchema> (which has a real
// `schema` property) to bind only the typed overload above. Without
// it, Form<TSchema> would structurally satisfy FormStateApi too and a
// bad selector could silently widen to FormState<unknown>.
export function useFormState<U>(
  form: FormStateApi & { readonly schema?: undefined },
  selector: (state: FormState<unknown>) => U,
): U;
export function useFormState<U>(
  form: FormStateApi,
  selector: (state: FormState<unknown>) => U,
): U {
  return useStore(form.store, selector);
}

export function useFormStateShallow<TSchema extends z.ZodType, U>(
  form: Form<TSchema>,
  selector: (state: FormState<z.input<TSchema>>) => U,
): U;
export function useFormStateShallow<U>(
  form: FormStateApi & { readonly schema?: undefined },
  selector: (state: FormState<unknown>) => U,
): U;
export function useFormStateShallow<U>(
  form: FormStateApi,
  selector: (state: FormState<unknown>) => U,
): U {
  return useStore(form.store, useShallow(selector));
}
