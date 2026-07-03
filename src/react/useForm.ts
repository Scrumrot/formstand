import { useEffect, useRef } from "react";
import type { z } from "zod";
import {
  type CreateFormOptions,
  type Form,
  createForm,
} from "../core/createForm";

// Lazy-creates a Form bound to this component instance. Schema and options are
// locked in on the first render; later changes are ignored (warned once below).
export const useForm = <TSchema extends z.ZodType>(
  schema: TSchema,
  options: CreateFormOptions<TSchema>,
): Form<TSchema> => {
  const formRef = useRef<Form<TSchema> | null>(null);
  if (formRef.current === null) {
    formRef.current = createForm(schema, options);
  }
  // Lazy init of an external store handle — the sanctioned useRef exception
  // (react.dev: "avoiding recreating the ref contents"); the rule can't see
  // that this read is guarded by the null-check init above.
  // eslint-disable-next-line react-hooks/refs
  const form = formRef.current;

  const warnedRef = useRef(false);
  useEffect(() => {
    if (!warnedRef.current && form.schema !== schema) {
      warnedRef.current = true;
      console.warn(
        "[formstand] useForm received a different schema reference after " +
          "the first render; schema and options changes are ignored for the " +
          "life of the component. If the schema is defined inline this is " +
          "harmless (but consider hoisting it to module scope). For initial " +
          "values that arrive later (e.g. from a fetch), call " +
          "form.adoptValues(values) or form.reset(values) instead.",
      );
    }
  }, [form, schema]);

  return form;
};
