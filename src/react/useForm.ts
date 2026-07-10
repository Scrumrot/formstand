import { useEffect, useRef } from "react";
import type { z } from "zod";
import {
  type CreateFormOptions,
  type Form,
  createForm,
} from "../core/createForm";
import { valuesEqual } from "../core/equality";

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

  const mountInitialsRef = useRef(options.initialValues);
  const warnedRef = useRef(false);
  useEffect(() => {
    // Two footguns, one warning: a new schema reference, or initial values
    // whose CONTENT changed after mount (the async-fetch pattern
    // `initialValues: data ?? {}` with a module-hoisted schema — the schema
    // check alone would never see it). Structural compare, so inline object
    // literals that re-create identical options every render stay silent.
    const changedInitials =
      !Object.is(options.initialValues, mountInitialsRef.current) &&
      !valuesEqual(options.initialValues, mountInitialsRef.current);
    if (!warnedRef.current && (form.schema !== schema || changedInitials)) {
      warnedRef.current = true;
      console.warn(
        "[formstand] useForm received a different schema or initial values " +
          "after the first render; schema and options changes are ignored " +
          "for the life of the component. If the schema is defined inline " +
          "this is harmless (but consider hoisting it to module scope). For " +
          "initial values that arrive later (e.g. from a fetch), call " +
          "form.adoptValues(values) or form.reset(values) instead.",
      );
    }
  }, [form, schema, options.initialValues]);

  return form;
};
