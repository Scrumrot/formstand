import {
  focusFirstError,
  textInputProps,
  useField,
  useForm,
  useIsSubmitting,
  useIsValidating,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "./fieldA11y";
import { z } from "zod";

const TAKEN = new Set(["admin", "root", "tim"]);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Two independent server checks with different latencies, so the global
// "checking" line and the per-field spinners visibly disagree for a moment:
// the username settles first, the form stays busy until the email does.
const schema = z.object({
  username: z
    .string()
    .min(3, "at least 3 chars")
    .refine(
      async (v) => {
        await delay(600);
        return !TAKEN.has(v.toLowerCase());
      },
      { message: "that username is taken" },
    ),
  email: z.email("valid email required").refine(
    async (v) => {
      await delay(900);
      return !v.toLowerCase().endsWith("@example.com");
    },
    { message: "example.com addresses are not accepted" },
  ),
});

export const AsyncForm = () => {
  const form = useForm(schema, {
    initialValues: { username: "", email: "" },
    mode: "onChange",
  });
  useDemoForm(form);
  const username = useField(form, "username", { debounceMs: 300 });
  const email = useField(form, "email", { debounceMs: 300 });
  // One answer for "is anything checking?": any field's in-flight pass or
  // a whole-form pass. The submit gates on it so a click never lands
  // between a keystroke and its verdict; submit's own async parse would
  // catch the value anyway, but the button should not look ready.
  const isValidating = useIsValidating(form);
  const isSubmitting = useIsSubmitting(form);
  const usernameA11y = fieldA11y(username, "username");
  const emailA11y = fieldA11y(email, "email");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit(
          (data) => {
            window.alert(`signed up: ${JSON.stringify(data)}`);
          },
          (errors) => {
            focusFirstError(errors);
          },
        );
      }}
    >
      <p className="subtitle">
        Reserved usernames: <code>admin</code>, <code>root</code>,{" "}
        <code>tim</code> (server check about 600 ms). Addresses at{" "}
        <code>example.com</code> are refused (about 900 ms). Each field
        debounces 300 ms after typing stops and keeps only its latest
        verdict; the form-level line below reads{" "}
        <code>useIsValidating(form)</code> and gates the submit.
      </p>

      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          {...textInputProps(username)}
          {...usernameA11y.control}
          autoComplete="off"
        />
        {/* The live region carries the pending state too, so a screen
            reader hears "checking..." and then the verdict. */}
        <span {...usernameA11y.message}>
          {username.isValidating ? (
            <span className="pending">checking...</span>
          ) : (
            (username.error?.[0] ?? " ")
          )}
        </span>
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          {...textInputProps(email)}
          {...emailA11y.control}
          type="email"
          autoComplete="off"
        />
        <span {...emailA11y.message}>
          {email.isValidating ? (
            <span className="pending">checking...</span>
          ) : (
            (email.error?.[0] ?? " ")
          )}
        </span>
      </div>

      <p className="pending" role="status" data-testid="form-validating">
        {isValidating ? "checking the form..." : " "}
      </p>

      <button
        className="primary"
        type="submit"
        disabled={isSubmitting || isValidating}
      >
        {isSubmitting ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
};
