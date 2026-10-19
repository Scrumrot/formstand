import { useState } from "react";
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
  displayName: z.string().min(1, "required"),
  bio: z.string().max(200, "max 200 chars"),
});

type Profile = z.input<typeof schema>;

const fakeServer = async (next: Profile): Promise<Profile> => {
  await new Promise((r) => setTimeout(r, 800));
  if (next.displayName.toLowerCase().includes("fail")) {
    throw new Error("server rejected the update");
  }
  return next;
};

// The profile the fake server starts with. A constant, not the
// serverProfile state: useForm locks its options at mount, so feeding it
// state that later changes only trips the dev warning about ignored
// option changes after a save. The rebase after a save is adoptValues'
// job below.
const INITIAL_PROFILE: Profile = {
  displayName: "Tim",
  bio: "Original bio.",
};

export const OptimisticForm = () => {
  const [serverProfile, setServerProfile] = useState<Profile>(INITIAL_PROFILE);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm(schema, {
    initialValues: INITIAL_PROFILE,
    mode: "onBlur",
  });
  useDemoForm(form);
  const displayName = useField(form, "displayName");
  const bio = useField(form, "bio");
  const isSubmitting = useFormSelector(form, (s) => s.isSubmitting);
  const displayNameA11y = fieldA11y(displayName, "display-name");
  const bioA11y = fieldA11y(bio, "bio");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    void form.submit(
      async (data) => {
        try {
          const saved = await fakeServer(data);
          setServerProfile(saved);
          form.adoptValues(saved);
        } catch (err) {
          form.adoptValues(serverProfile);
          setServerError(err instanceof Error ? err.message : "unknown error");
        }
      },
      (errors) => {
        focusFirstError(errors);
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <p className="subtitle">
        Edit and submit. Including <code>fail</code> in display name simulates
        a server rejection; values roll back to the last known good state.
      </p>

      <div className="field">
        <label htmlFor="display-name">Display name</label>
        <input {...textInputProps(displayName)} {...displayNameA11y.control} />
        <span {...displayNameA11y.message}>
          {displayName.error?.[0] ?? " "}
        </span>
      </div>

      <div className="field">
        <label htmlFor="bio">Bio</label>
        <textarea rows={3} {...textInputProps(bio)} {...bioA11y.control} />
        <span {...bioA11y.message}>{bio.error?.[0] ?? " "}</span>
      </div>

      {serverError !== null ? (
        // Inside a .field wrapper: the playground scopes .error styling
        // under .field, so a bare error div renders unstyled. role="alert"
        // because the rejection belongs to no one control.
        <div className="field" style={{ marginBottom: 12 }}>
          <span className="error" role="alert">
            Server error: {serverError}
          </span>
        </div>
      ) : null}

      <button className="primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save"}
      </button>

      <div
        style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)" }}
      >
        Last known server state:{" "}
        <code>{JSON.stringify(serverProfile)}</code>
      </div>
    </form>
  );
};
