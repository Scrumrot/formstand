import {
  CheckboxField,
  SelectField,
  TextField,
  focusFirstError,
  useFieldArray,
  useForm,
  useFormError,
} from "formstand";
import { FormstandDevtools } from "formstand/devtools";
import { useDemoForm } from "../demo/DemoShell";
import { z } from "zod";

// A form built to give the devtools panel something to show in every
// section: a root-level refine (an error no input displays), an array with
// its own rule (an error keyed at the container), and a button that writes
// a server error so both channels hold an entry at once.
const schema = z
  .object({
    name: z.string().min(2, "at least 2 characters"),
    email: z.email("valid email required"),
    role: z.enum(["viewer", "editor", "admin"]),
    tags: z
      .array(z.string().min(1, "empty tag"))
      .min(1, "add at least one tag"),
    newsletter: z.boolean(),
  })
  .refine((values) => values.role !== "admin" || values.newsletter, {
    message: "admins must receive the newsletter",
  });

export const DevtoolsDemo = () => {
  const form = useForm(schema, {
    initialValues: {
      name: "Ada",
      email: "ada@example.com",
      role: "viewer",
      tags: ["founder"],
      newsletter: false,
    },
  });
  useDemoForm(form);
  const tags = useFieldArray(form, "tags");
  const rootError = useFormError(form);

  return (
    <form
      onSubmit={form.handleSubmit(
        (data) => {
          window.alert(`saved: ${JSON.stringify(data)}`);
        },
        (errors) => focusFirstError(errors),
      )}
    >
      <p className="subtitle">
        <code>formstand/devtools</code>, mounted next to the form in the
        bottom-right corner: one row per field with value, error and flags,
        the two error channels counted separately, the root{" "}
        <code>refine</code> message no input shows, the live{" "}
        <code>diff()</code>, and snapshot/restore. Edit a field, pick{" "}
        <em>admin</em> without the newsletter, remove the last tag, or write
        a server error, and watch the panel follow.
      </p>

      <TextField form={form} path="name" label="Name" autoComplete="name" />
      <TextField
        form={form}
        path="email"
        label="Email"
        type="email"
        autoComplete="email"
      />
      <SelectField
        form={form}
        path="role"
        label="Role"
        options={[
          { value: "viewer", label: "Viewer" },
          { value: "editor", label: "Editor" },
          { value: "admin", label: "Admin" },
        ]}
      />
      <CheckboxField form={form} path="newsletter" label="Receive the newsletter" />

      <fieldset className="field">
        <legend>Tags</legend>
        {tags.fields.map((row, index) => (
          <div key={row.id} className="row" style={{ alignItems: "flex-end" }}>
            <TextField form={form} path={`tags.${index}`} label={`Tag ${index + 1}`} />
            <button
              className="secondary"
              type="button"
              onClick={() => tags.remove(index)}
              aria-label={`remove tag ${index + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <span className="error" role="alert">
          {tags.firstError ?? " "}
        </span>
        <button className="secondary" type="button" onClick={() => tags.push("")}>
          + tag
        </button>
      </fieldset>

      {rootError !== undefined ? (
        <p className="error" role="alert">
          {rootError[0]}
        </p>
      ) : null}

      <div className="row">
        <button className="primary" type="submit">
          Save
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => form.setError("email", "already registered")}
        >
          Write a server error
        </button>
        <button className="secondary" type="button" onClick={() => form.reset()}>
          Reset
        </button>
      </div>

      {/* The deployed playground is a production build, where the panel
          renders nothing by default (it exposes the whole form state).
          `enabled` opts in because showing the state IS this tab's point;
          an app leaves it unset and gets the panel in development only. */}
      <FormstandDevtools form={form} enabled defaultOpen label="profile" />
    </form>
  );
};
