import { useField, useForm, useFormState } from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const schema = z.object({
  name: z.string().min(2),
  address: z.object({
    street: z.string().min(1, "street required"),
    city: z.string().min(1, "city required"),
    zip: z.string().regex(/^\d{5}$/, "5-digit zip"),
  }),
});

export const NestedForm = () => {
  const form = useForm(schema, {
    initialValues: {
      name: "Tim",
      address: { street: "", city: "", zip: "" },
    },
  });

  const name = useField<string>(form, "name");
  const street = useField<string>(form, "address.street");
  const city = useField<string>(form, "address.city");
  const zip = useField<string>(form, "address.zip");
  const isSubmitting = useFormState(form, (s) => s.isSubmitting);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit(async (data) => {
          await new Promise((r) => setTimeout(r, 600));
          window.alert(`submit ok: ${JSON.stringify(data)}`);
        });
      }}
    >
      <div className="field">
        <label>Name</label>
        <input
          value={name.value ?? ""}
          onChange={(e) => name.setValue(e.target.value)}
          onBlur={name.onBlur}
        />
        <span className="error">{name.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>Street</label>
        <input
          value={street.value ?? ""}
          onChange={(e) => street.setValue(e.target.value)}
          onBlur={street.onBlur}
        />
        <span className="error">{street.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>City</label>
        <input
          value={city.value ?? ""}
          onChange={(e) => city.setValue(e.target.value)}
          onBlur={city.onBlur}
        />
        <span className="error">{city.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>Zip</label>
        <input
          value={zip.value ?? ""}
          onChange={(e) => zip.setValue(e.target.value)}
          onBlur={zip.onBlur}
        />
        <span className="error">{zip.error?.[0] ?? " "}</span>
      </div>

      <button className="primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit"}
      </button>

      <StateDump form={form} />
    </form>
  );
};
