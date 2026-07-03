import {
  TextField,
  focusFirstError,
  useForm,
  useIsSubmitting,
} from "formstand";
import { z } from "zod";
import { StateDump } from "./StateDump";

const schema = z.object({
  email: z.email("must be a valid email"),
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

export const ServerErrorsForm = () => {
  const form = useForm(schema, {
    initialValues: { email: "", username: "" },
    mode: "onBlur",
  });
  const isSubmitting = useIsSubmitting(form);

  return (
    <form
      onSubmit={form.handleSubmit(
        async (data) => {
          const result = await fakeServer(data);
          if (result.ok) {
            window.alert("registered!");
            form.reset();
            return;
          }
          for (const err of result.errors) {
            form.setError(err.field, err.message);
          }
          focusFirstError(form.getState().errors);
        },
        // Schema-invalid submit: jump to the first offending input.
        (errors) => focusFirstError(errors),
      )}
    >
      <p className="subtitle">
        Try <code>admin</code> as username, or any <code>@banned.com</code>{" "}
        email — the fake server rejects with field-level errors. Server errors
        survive background revalidation and release when you edit the field;
        the first offending input is focused via{" "}
        <code>focusFirstError</code>.
      </p>

      <TextField form={form} path="email" label="Email" type="email" />
      <TextField form={form} path="username" label="Username" />

      <button className="primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Registering..." : "Register"}
      </button>

      <StateDump form={form} />
    </form>
  );
};
