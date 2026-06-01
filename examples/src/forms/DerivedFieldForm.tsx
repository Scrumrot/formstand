import { useEffect } from "react";
import {
  textInputProps,
  useField,
  useForm,
  useFormState,
} from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const schema = z.object({
  firstName: z.string().min(1, "required"),
  lastName: z.string().min(1, "required"),
  displayName: z.string(),
});

export const DerivedFieldForm = () => {
  const form = useForm(schema, {
    initialValues: { firstName: "", lastName: "", displayName: "" },
    mode: "onBlur",
  });
  const firstName = useField(form, "firstName");
  const lastName = useField(form, "lastName");
  const displayName = useFormState(form, (s) => s.values.displayName);

  useEffect(() => {
    const unsubFirst = form.watchValue("firstName", (next) => {
      const last = form.getField("lastName");
      form.setValue("displayName", `${next} ${last}`.trim());
    });
    const unsubLast = form.watchValue("lastName", (next) => {
      const first = form.getField("firstName");
      form.setValue("displayName", `${first} ${next}`.trim());
    });
    return () => {
      unsubFirst();
      unsubLast();
    };
  }, [form]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`hello, ${data.displayName}`);
        });
      }}
    >
      <p className="subtitle">
        <code>displayName</code> is derived from firstName + lastName via two{" "}
        <code>watchValue</code> subscriptions. Edit either source and watch
        the derived value update without triggering infinite loops.
      </p>

      <div className="field">
        <label>First name</label>
        <input {...textInputProps(firstName)} />
        <span className="error">{firstName.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>Last name</label>
        <input {...textInputProps(lastName)} />
        <span className="error">{lastName.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>Display name (derived)</label>
        <input value={displayName} readOnly disabled />
      </div>

      <button className="primary" type="submit">
        Greet
      </button>

      <StateDump form={form} />
    </form>
  );
};
