import { useField, useForm, useFormSelector, type ValidationMode } from "formstand";
import { useDemoForm } from "../demo/DemoShell";
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`submit ok: ${JSON.stringify(data)}`);
        });
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
          id="name"
          value={name.value ?? ""}
          onChange={(e) => name.setValue(e.target.value)}
          onBlur={name.onBlur}
        />
        <span className="error">{name.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          value={email.value ?? ""}
          onChange={(e) => email.setValue(e.target.value)}
          onBlur={email.onBlur}
        />
        <span className="error">{email.error?.[0] ?? " "}</span>
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
