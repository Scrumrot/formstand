import { useEffect } from "react";
import {
  focusFirstError,
  textInputProps,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "../demo/fieldA11y";
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
  const firstA11y = fieldA11y(firstName, "first-name");
  const lastA11y = fieldA11y(lastName, "last-name");

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
        void form.submit(
          (data) => {
            window.alert(`hello, ${data.displayName}`);
          },
          (errors) => {
            focusFirstError(errors);
          },
        );
      }}
    >
      <p className="subtitle">
        <code>displayName</code> is derived from firstName + lastName via two{" "}
        <code>watchValue</code> subscriptions. Edit either source and watch
        the derived value update without triggering infinite loops.
      </p>

      <div className="field">
        <label htmlFor="first-name">First name</label>
        <input {...textInputProps(firstName)} {...firstA11y.control} />
        <span {...firstA11y.message}>{firstName.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="last-name">Last name</label>
        <input {...textInputProps(lastName)} {...lastA11y.control} />
        <span {...lastA11y.message}>{lastName.error?.[0] ?? " "}</span>
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
