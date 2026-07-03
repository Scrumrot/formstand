import { useState } from "react";
import {
  textInputProps,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { z } from "zod";
import { StateDump } from "./StateDump";

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

export const OptimisticForm = () => {
  const [serverProfile, setServerProfile] = useState<Profile>({
    displayName: "Tim",
    bio: "Original bio.",
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm(schema, {
    initialValues: serverProfile,
    mode: "onBlur",
  });
  const displayName = useField(form, "displayName");
  const bio = useField(form, "bio");
  const isSubmitting = useFormSelector(form, (s) => s.isSubmitting);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    void form.submit(async (data) => {
      try {
        const saved = await fakeServer(data);
        setServerProfile(saved);
        form.adoptValues(saved);
      } catch (err) {
        form.adoptValues(serverProfile);
        setServerError(err instanceof Error ? err.message : "unknown error");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p className="subtitle">
        Edit and submit. Including <code>fail</code> in display name simulates
        a server rejection; values roll back to the last known good state.
      </p>

      <div className="field">
        <label>Display name</label>
        <input {...textInputProps(displayName)} />
        <span className="error">{displayName.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>Bio</label>
        <textarea
          rows={3}
          {...textInputProps(bio)}
          style={{
            background: "#0b0d12",
            border: "1px solid #2a3140",
            color: "#e6ebf5",
            padding: "10px 12px",
            borderRadius: 6,
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
        <span className="error">{bio.error?.[0] ?? " "}</span>
      </div>

      {serverError !== null ? (
        <div className="error" style={{ marginBottom: 12 }}>
          Server error: {serverError}
        </div>
      ) : null}

      <button className="primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Save"}
      </button>

      <div style={{ marginTop: 16, fontSize: 12, color: "#8b94a7" }}>
        Last known server state:{" "}
        <code>{JSON.stringify(serverProfile)}</code>
      </div>

      <StateDump form={form} />
    </form>
  );
};
