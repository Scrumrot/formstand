import {
  textInputProps,
  useField,
  useFormActionState,
  useForm,
  useFormError,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { z } from "zod";

// The React 19 form-actions bridge: <form action={...}> + useActionState
// with schema-validated data. The action only ever sees data the schema
// accepted; a failed submission writes field errors to the form (rendered
// below the inputs) and keeps the last action verdict on screen.

const schema = z.object({
  handle: z.string().min(3, "at least 3 characters"),
  email: z.string().email("not an email"),
});

type SaveState = Readonly<{
  status: "idle" | "saved" | "failed";
  detail: string;
  saves: number;
}>;

// Stands in for a server action: same (prevState, data) shape a
// "use server" function would have, minus the network.
const saveProfile = async (
  prev: SaveState,
  data: z.output<typeof schema>,
): Promise<SaveState> => {
  await new Promise((r) => setTimeout(r, 700));
  if (data.handle.toLowerCase().includes("fail")) {
    throw new Error("server rejected the handle");
  }
  return {
    status: "saved",
    detail: `@${data.handle} <${data.email}>`,
    saves: prev.saves + 1,
  };
};

export const ActionsForm = () => {
  const form = useForm(schema, {
    initialValues: { handle: "tim", email: "tim@example.com" },
    mode: "onBlur",
  });
  useDemoForm(form);
  const handle = useField(form, "handle");
  const email = useField(form, "email");

  const [result, saveAction, isPending] = useFormActionState(
    form,
    saveProfile,
    { status: "idle", detail: "nothing saved yet", saves: 0 } as SaveState,
    {
      // The save-failure hook: a throwing action resolves quietly by
      // contract, so surface it — here as the last verdict.
      onError: (error) =>
        form.setError(
          "",
          error instanceof Error ? error.message : "save failed",
        ),
    },
  );
  const rootError = useFormError(form);

  return (
    <form action={saveAction}>
      <p className="subtitle">
        Submits through <code>useFormActionState</code>: validation runs
        before the action, invalid submits keep the last verdict, and{" "}
        <code>fail</code> in the handle simulates a rejected save.
      </p>

      <div className="field">
        <label>Handle</label>
        <input {...textInputProps(handle)} />
        <span className="error">{handle.firstError ?? " "}</span>
      </div>

      <div className="field">
        <label>Email</label>
        <input {...textInputProps(email)} />
        <span className="error">{email.firstError ?? " "}</span>
      </div>

      {rootError !== undefined ? (
        <div className="error" style={{ marginBottom: 12 }}>
          {rootError[0]}
        </div>
      ) : null}

      <p className="subtitle">
        Last verdict: <strong>{result.status}</strong> — {result.detail}
        {result.saves > 0 ? ` (${result.saves} saved)` : ""}
      </p>

      <button className="primary" type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save via action"}
      </button>
    </form>
  );
};
