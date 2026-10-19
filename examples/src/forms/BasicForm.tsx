import {
  focusFirstError,
  useField,
  useForm,
  useFormSelector,
  type ValidationMode,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "../demo/fieldA11y";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "name must be at least 2 chars"),
  email: z.email("must be a valid email"),
});

export const BasicForm = () => {
  const form = useForm(schema, {
    initialValues: { name: "", email: "" },
  });
  useDemoForm(form);
  const mode = useFormSelector(form, (s) => s.mode);
  const name = useField(form, "name");
  const email = useField(form, "email");
  const isSubmitting = useFormSelector(form, (s) => s.isSubmitting);
  // Raw inputs bound by hand carry none of the bound components' a11y
  // wiring, so each one gets the shared id / aria-describedby pair.
  const nameA11y = fieldA11y(name, "name");
  const emailA11y = fieldA11y(email, "email");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // The invalid handler moves focus to the first errored control (by
        // its name attribute), the same thing the MUI demos do.
        void form.submit(
          (data) => {
            window.alert(`submit ok: ${JSON.stringify(data)}`);
          },
          (errors) => {
            focusFirstError(errors);
          },
        );
      }}
    >
      <div className="field">
        <label htmlFor="mode-select">Validation mode</label>
        <select
          id="mode-select"
          value={mode}
          onChange={(e) => form.setMode(e.target.value as ValidationMode)}
        >
          <option value="onBlur">onBlur (default)</option>
          <option value="onChange">onChange</option>
          <option value="onSubmit">onSubmit</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          {...nameA11y.control}
          name={name.path}
          value={name.value ?? ""}
          onChange={(e) => name.setValue(e.target.value)}
          onBlur={name.onBlur}
        />
        <span {...nameA11y.message}>{name.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          {...emailA11y.control}
          name={email.path}
          value={email.value ?? ""}
          onChange={(e) => email.setValue(e.target.value)}
          onBlur={email.onBlur}
        />
        <span {...emailA11y.message}>{email.error?.[0] ?? " "}</span>
      </div>

      <div className="row">
        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit"}
        </button>
        <button className="secondary" type="button" onClick={() => form.reset()}>
          Reset
        </button>
      </div>
    </form>
  );
};
