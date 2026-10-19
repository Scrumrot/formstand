import {
  focusFirstError,
  textInputProps,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "./fieldA11y";
import { z } from "zod";

const TAKEN = new Set(["admin", "root", "tim"]);

const schema = z.object({
  username: z
    .string()
    .min(3, "at least 3 chars")
    .refine(
      async (v) => {
        await new Promise((r) => setTimeout(r, 600));
        return !TAKEN.has(v.toLowerCase());
      },
      { message: "that username is taken" },
    ),
});

export const AsyncForm = () => {
  const form = useForm(schema, {
    initialValues: { username: "" },
    mode: "onChange",
  });
  useDemoForm(form);
  const username = useField(form, "username", { debounceMs: 300 });
  const isSubmitting = useFormSelector(form, (s) => s.isSubmitting);
  const a11y = fieldA11y(username, "username");

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
        Reserved: <code>admin</code>, <code>root</code>, <code>tim</code>.
        Server check is ~600ms. Validation debounces 300ms after typing stops;
        race-handling means only the last request wins.
      </p>

      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          {...textInputProps(username)}
          {...a11y.control}
          autoComplete="off"
        />
        {/* The live region carries the pending state too, so a screen
            reader hears "checking..." and then the verdict. */}
        <span {...a11y.message}>
          {username.isValidating ? (
            <span className="pending">checking...</span>
          ) : (
            (username.error?.[0] ?? " ")
          )}
        </span>
      </div>

      <button className="primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
};
