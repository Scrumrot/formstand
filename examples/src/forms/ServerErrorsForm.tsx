import { type FieldFormApi, useField, useForm, useFormState } from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const schema = z.object({
  email: z.string().email("must be a valid email"),
  username: z.string().min(3, "min 3 chars"),
});

type ServerError = Readonly<{
  field: "email" | "username";
  message: string;
}>;

const fakeServer = async (
  data: z.infer<typeof schema>,
): Promise<{ ok: true } | { ok: false; errors: readonly ServerError[] }> => {
  await new Promise((r) => setTimeout(r, 500));
  if (data.username.toLowerCase() === "admin") {
    return {
      ok: false,
      errors: [{ field: "username", message: "username reserved" }],
    };
  }
  if (data.email.endsWith("@banned.com")) {
    return {
      ok: false,
      errors: [{ field: "email", message: "email domain blocked" }],
    };
  }
  return { ok: true };
};

type TextFieldProps = Readonly<{
  form: FieldFormApi;
  path: string;
  label: string;
}>;

const TextField = ({ form, path, label }: TextFieldProps) => {
  const field = useField<string>(form, path);
  return (
    <div className="field">
      <label>{label}</label>
      <input
        value={field.value ?? ""}
        onChange={(e) => {
          field.setValue(e.target.value);
          field.clearError();
        }}
        onBlur={field.onBlur}
      />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};

export const ServerErrorsForm = () => {
  const form = useForm(schema, {
    initialValues: { email: "", username: "" },
    mode: "onBlur",
  });
  const isSubmitting = useFormState(form, (s) => s.isSubmitting);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit(async (data) => {
          const result = await fakeServer(data);
          if (result.ok) {
            window.alert("registered!");
            form.reset();
            return;
          }
          for (const err of result.errors) {
            form.setError(err.field, [err.message]);
          }
        });
      }}
    >
      <p className="subtitle">
        Try <code>admin</code> as username, or any <code>@banned.com</code>{" "}
        email — the fake server rejects with field-level errors.
      </p>

      <TextField form={form} path="email" label="Email" />
      <TextField form={form} path="username" label="Username" />

      <button className="primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Registering..." : "Register"}
      </button>

      <StateDump form={form} />
    </form>
  );
};
