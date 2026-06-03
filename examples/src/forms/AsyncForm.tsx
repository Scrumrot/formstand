import {
  textInputProps,
  useField,
  useForm,
  useFormState,
} from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

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
  const username = useField(form, "username", { debounceMs: 300 });
  const isSubmitting = useFormState(form, (s) => s.isSubmitting);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`signed up: ${JSON.stringify(data)}`);
        });
      }}
    >
      <p className="subtitle">
        Reserved: <code>admin</code>, <code>root</code>, <code>tim</code>.
        Server check is ~600ms. Validation debounces 300ms after typing stops;
        race-handling means only the last request wins.
      </p>

      <div className="field">
        <label>Username</label>
        <input {...textInputProps(username)} autoComplete="off" />
        <span className="error">
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

      <StateDump form={form} />
    </form>
  );
};
