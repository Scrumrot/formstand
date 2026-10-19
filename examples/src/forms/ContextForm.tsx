import {
  TextField,
  createFormContext,
  useField,
  useForm,
  useFormError,
  useIsDirty,
  useIsSubmitting,
  useIsValid,
  useSubmitCount,
  textInputProps,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "./fieldA11y";
import { z } from "zod";

const schema = z
  .object({
    displayName: z.string().min(2, "min 2 chars"),
    tagline: z.string().max(60, "60 chars max"),
  })
  .refine((d) => d.displayName.toLowerCase() !== d.tagline.toLowerCase(), {
    message: "tagline must differ from display name",
  });

const { Provider, useFormContext } = createFormContext<typeof schema>();

// No form prop anywhere below: children reach the form through the typed
// context, so paths still autocomplete and typo'd ones fail to compile.

const DisplayNameField = () => {
  const form = useFormContext();
  return <TextField form={form} path="displayName" label="Display name" />;
};

const TaglineField = () => {
  const form = useFormContext();
  const tagline = useField(form, "tagline");
  // The custom-input half of the demo wires its own a11y where TextField
  // above gets it for free.
  const a11y = fieldA11y(tagline, "tagline");
  return (
    <div className="field">
      <label htmlFor="tagline">Tagline (custom input via textInputProps)</label>
      <input {...textInputProps(tagline)} {...a11y.control} />
      <span {...a11y.message}>{tagline.error?.[0] ?? " "}</span>
    </div>
  );
};

const RootError = () => {
  const form = useFormContext();
  const rootError = useFormError(form);
  // role="alert": the schema-level refine belongs to no control, so there
  // is nothing to describe; announcing it on appearance is the right move.
  return rootError !== undefined ? (
    <p className="error" role="alert">
      {rootError[0]}
    </p>
  ) : null;
};

const StatusBar = () => {
  const form = useFormContext();
  const dirty = useIsDirty(form);
  const valid = useIsValid(form);
  const submitting = useIsSubmitting(form);
  const submits = useSubmitCount(form);
  return (
    <p className="subtitle">
      {dirty ? "● Unsaved changes" : "No changes"} · currently{" "}
      {valid ? "valid" : "invalid"} · {submits} submit attempt(s)
      {submitting ? " · submitting…" : ""}
    </p>
  );
};

export const ContextForm = () => {
  const form = useForm(schema, {
    initialValues: { displayName: "", tagline: "" },
    mode: "onBlur",
  });
  useDemoForm(form);

  return (
    <Provider form={form}>
      <form
        onSubmit={form.handleSubmit(async (data) => {
          await new Promise((r) => setTimeout(r, 400));
          window.alert(`saved: ${JSON.stringify(data)}`);
          form.adoptValues(data);
        })}
      >
        <p className="subtitle">
          One <code>createFormContext</code> provider; every child below reads
          the form from context, no prop drilling. The status bar is built
          from the flag hooks (<code>useIsDirty</code> /{" "}
          <code>useIsValid</code> / <code>useIsSubmitting</code> /{" "}
          <code>useSubmitCount</code>); the schema-level refine surfaces via{" "}
          <code>useFormError</code>.
        </p>

        <StatusBar />
        <DisplayNameField />
        <TaglineField />
        <RootError />

        <button className="primary" type="submit">
          Save profile
        </button>
      </form>
    </Provider>
  );
};
