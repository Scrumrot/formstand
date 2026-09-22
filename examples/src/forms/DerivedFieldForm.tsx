import { useEffect } from "react";
import {
  textInputProps,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { z } from "zod";

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
  useDemoForm(form);
  const firstName = useField(form, "firstName");
  const lastName = useField(form, "lastName");
  const displayName = useFormSelector(form, (s) => s.values.displayName);

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
        <label htmlFor="first-name">First name</label>
        <input id="first-name" {...textInputProps(firstName)} />
        <span className="error">{firstName.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="last-name">Last name</label>
        <input id="last-name" {...textInputProps(lastName)} />
        <span className="error">{lastName.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="display-name-derived">Display name (derived)</label>
        <input id="display-name-derived" value={displayName} readOnly disabled />
      </div>

      <button className="primary" type="submit">
        Greet
      </button>
    </form>
  );
};
