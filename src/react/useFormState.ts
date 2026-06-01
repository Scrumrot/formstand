import type { z } from "zod";
import { useStore } from "zustand/react";
import { useShallow } from "zustand/react/shallow";
import type { Form } from "../core/createForm";
import type { FormState } from "../core/types";

export const useFormState = <TSchema extends z.ZodType, U>(
  form: Form<TSchema>,
  selector: (state: FormState<z.input<TSchema>>) => U,
): U => useStore(form.store, selector);

export const useFormStateShallow = <TSchema extends z.ZodType, U>(
  form: Form<TSchema>,
  selector: (state: FormState<z.input<TSchema>>) => U,
): U => useStore(form.store, useShallow(selector));
