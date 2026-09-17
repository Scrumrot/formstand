import { useActionState, useCallback, useEffect, useRef } from "react";
import type { z } from "zod";
import type {
  Form,
  InvalidSubmitHandler,
  SubmitResult,
} from "../core/createForm";
import type { DefaultPathDepth, PathDepth } from "../core/fieldPath";

// The React 19 form-actions bridge: bind a formstand form's validation and
// submit lifecycle to `<form action={...}>` and useActionState, so the
// action world gets what onSubmit callers already have — schema
// validation before the action runs, isSubmitting/submitCount tracking,
// errors written and their fields marked touched on a failed submit, and
// the two-channel error model for the action's own verdicts.
//
// The handler receives PARSED, TYPED data (z.output of the schema), not
// FormData: formstand inputs are controlled, so the store is the source of
// truth and the schema has already judged it. The raw FormData still
// arrives as the last argument for what only it can carry — uncontrolled
// inputs in the same <form>, file pickers — and because a server action
// can take it across the wire (FormData serializes under RSC).
//
// Honest scope: this is a CLIENT-side integration. React's no-JS
// progressive enhancement only works when the server action itself is
// passed to the form/useActionState, which by definition skips any
// client-side wrapper — for that path, validate on the server with the
// same zod schema and keep this bridge for the hydrated experience.
//
// Note on React's post-action reset: React 19 resets UNCONTROLLED form
// fields after an action completes. formstand inputs are controlled, so
// the form's values survive the action untouched.

export type FormActionHandler<TSchema extends z.ZodType> = (
  data: z.output<TSchema>,
  formData: FormData,
) => void | Promise<void>;

// S is the AWAITED state (what the reducer stores), so the handler's
// return may be the state or a promise of it — the shape a "use server"
// async function naturally has.
export type FormActionStateHandler<TSchema extends z.ZodType, S> = (
  prevState: S,
  data: z.output<TSchema>,
  formData: FormData,
) => S | Promise<S>;

export type FormActionOptions = Readonly<{
  // Mirrors handleSubmit's second parameter: runs when validation fails
  // (errors are written and fields marked touched either way).
  onInvalid?: InvalidSubmitHandler;
  // Mirrors SubmitOptions.onError: the save-failure hook for a throwing
  // handler. Without it, dev builds warn when a failure resolves
  // unobserved — the action form is fire-and-forget, like handleSubmit.
  onError?: (error: unknown) => void;
}>;

// The fire-and-forget dev warning, same contract as handleSubmit's: a
// throwing handler resolves {kind: "error"} writing no state, so with no
// onError the failure would vanish completely.
const warnUnobserved = (
  result: SubmitResult<unknown>,
  options: FormActionOptions | undefined,
  site: string,
): void => {
  if (
    result.kind === "error" &&
    options?.onError === undefined &&
    process.env.NODE_ENV !== "production"
  ) {
    console.warn(
      `[formstand] action handler threw and nothing observed it — the form shows no feedback. Pass { onError } to ${site} (or setError inside your handler):`,
      result.error,
    );
  }
};

// The plain bridge: an action for `<form action={...}>`. Validation and
// the submit lifecycle run first; the handler only sees data the schema
// accepted. The returned function is REFERENCE-STABLE across renders
// (handler and options are read through refs assigned in an effect —
// actions only fire after mount, so the refs are always populated), which
// keeps memoized subtrees quiet however the caller writes the handler.
export const useFormAction = <
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  onValid: FormActionHandler<TSchema>,
  options?: FormActionOptions,
): ((formData: FormData) => Promise<void>) => {
  const latest = useRef({ onValid, options });
  useEffect(() => {
    latest.current = { onValid, options };
  });
  return useCallback(
    async (formData: FormData) => {
      const { onValid: handler, options: opts } = latest.current;
      const result = await form.submit(
        (data) => handler(data, formData),
        opts?.onInvalid,
        opts?.onError === undefined ? undefined : { onError: opts.onError },
      );
      warnUnobserved(result, opts, "useFormAction");
    },
    [form],
  );
};

// The stateful bridge: useActionState with schema-validated data. The
// handler's shape mirrors the native (prevState, formData) signature with
// the parsed data spliced in, so a "use server" function slots straight
// in. A submission that fails validation (or is skipped, or throws)
// returns the PREVIOUS state unchanged: field errors already live in the
// form store where the bound components read them, so the action state
// stays what it is — the last verdict an action actually produced.
export const useFormActionState = <
  TSchema extends z.ZodType,
  S,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  action: FormActionStateHandler<TSchema, S>,
  initialState: S,
  options?: FormActionOptions,
): [state: S, formAction: (formData: FormData) => void, isPending: boolean] => {
  const [state, formAction, isPending] = useActionState<S, FormData>(
    async (prevState, formData): Promise<S> => {
      // React hands the reducer Awaited<S>; S is declared as the awaited
      // state, so for any non-thenable state (the only kind a reducer can
      // meaningfully hold) the two are the same type — TS just won't
      // simplify the deferred conditional for an unconstrained S.
      const prev = prevState as S;
      // Sanctioned mutable ref for the handler's return value: submit owns
      // the lifecycle and its onValid returns void, so the next state
      // rides out through the closure (same shape as the codebase's other
      // capture refs).
      const nextRef: { current: S } = { current: prev };
      const result = await form.submit(
        async (data) => {
          nextRef.current = await action(prev, data, formData);
        },
        options?.onInvalid,
        options?.onError === undefined
          ? undefined
          : { onError: options.onError },
      );
      warnUnobserved(result, options, "useFormActionState");
      return nextRef.current;
    },
    initialState as Awaited<S>,
  );
  return [state as S, formAction, isPending];
};
