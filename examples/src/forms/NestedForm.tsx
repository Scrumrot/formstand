import {
  type UseFieldReturn,
  focusFirstError,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "../demo/fieldA11y";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2),
  address: z.object({
    street: z.string().min(1, "street required"),
    city: z.string().min(1, "city required"),
    zip: z.string().regex(/^\d{5}$/, "5-digit zip"),
  }),
});

// Four identical hand-bound inputs; one component keeps the a11y wiring
// (id, name, aria-invalid, aria-describedby) in one place. The control id
// is the path ("address.city"), which is also what focusFirstError walks.
const Field = ({
  label,
  field,
}: Readonly<{ label: string; field: UseFieldReturn<string> }>) => {
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input
        {...a11y.control}
        name={field.path}
        value={field.value ?? ""}
        onChange={(e) => field.setValue(e.target.value)}
        onBlur={field.onBlur}
      />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};

export const NestedForm = () => {
  const form = useForm(schema, {
    initialValues: {
      name: "Tim",
      address: { street: "", city: "", zip: "" },
    },
  });
  useDemoForm(form);

  const name = useField(form, "name");
  const street = useField(form, "address.street");
  const city = useField(form, "address.city");
  const zip = useField(form, "address.zip");
  const isSubmitting = useFormSelector(form, (s) => s.isSubmitting);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit(
          async (data) => {
            await new Promise((r) => setTimeout(r, 600));
            window.alert(`submit ok: ${JSON.stringify(data)}`);
          },
          (errors) => {
            focusFirstError(errors);
          },
        );
      }}
    >
      <Field label="Name" field={name} />
      <Field label="Street" field={street} />
      <Field label="City" field={city} />
      <Field label="Zip" field={zip} />

      <button className="primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit"}
      </button>
    </form>
  );
};
