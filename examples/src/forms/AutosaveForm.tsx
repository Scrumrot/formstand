import { useEffect, useState } from "react";
import {
  focusFirstError,
  textInputProps,
  useField,
  useForm,
  useFormSelectorShallow,
  useIsDirty,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "../demo/fieldA11y";
import { z } from "zod";

const STORAGE_KEY = "formstand:autosave-demo";
const DEBOUNCE_MS = 800;

const schema = z.object({
  title: z.string().min(1, "title required"),
  body: z.string().min(1, "body required"),
});

type Values = z.input<typeof schema>;

const BLANK: Values = { title: "", body: "" };

// What mount found in storage: a restored draft is reported as such (the
// status line says "Draft restored" until the next edit, where it used to
// read "Unsaved changes" for values that were in fact just saved) and the
// absence of one as a blank start.
type Draft =
  | Readonly<{ kind: "restored"; values: Values }>
  | Readonly<{ kind: "blank" }>;

const loadDraft = (): Draft => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { kind: "blank" };
    const parsed = JSON.parse(raw) as unknown;
    const result = schema.partial().safeParse(parsed);
    if (!result.success) return { kind: "blank" };
    return {
      kind: "restored",
      values: { title: result.data.title ?? "", body: result.data.body ?? "" },
    };
  } catch {
    return { kind: "blank" };
  }
};

// The status line's states, in priority order below: an in-flight save, a
// completed save, a draft restored by mount, edits since, or nothing.
type SaveStatus =
  | Readonly<{ kind: "saving" }>
  | Readonly<{ kind: "saved"; at: number }>
  | Readonly<{ kind: "restored" }>
  | Readonly<{ kind: "none" }>;

const statusText = (status: SaveStatus, dirty: boolean): string => {
  switch (status.kind) {
    case "saving":
      return "Saving...";
    case "saved":
      return `Draft saved at ${new Date(status.at).toLocaleTimeString()}`;
    case "restored":
      return "Draft restored";
    case "none":
      return dirty ? "Unsaved changes" : "No draft";
  }
};

export const AutosaveForm = () => {
  const [draft] = useState(loadDraft);
  const [status, setStatus] = useState<SaveStatus>(
    draft.kind === "restored" ? { kind: "restored" } : { kind: "none" },
  );
  const [titleChanges, setTitleChanges] = useState(0);

  const form = useForm(schema, {
    initialValues: draft.kind === "restored" ? draft.values : BLANK,
    mode: "onBlur",
  });
  useDemoForm(form);
  const title = useField(form, "title");
  const body = useField(form, "body");
  const dirty = useIsDirty(form);
  const dirtyPaths = useFormSelectorShallow(form, () => form.dirtyFields());
  const titleA11y = fieldA11y(title, "title");
  const bodyA11y = fieldA11y(body, "body");

  useEffect(() => {
    const timerRef: { current: ReturnType<typeof setTimeout> | null } = {
      current: null,
    };
    const unsubAll = form.watchValues((next) => {
      setStatus({ kind: "saving" });
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setStatus({ kind: "saved", at: Date.now() });
      }, DEBOUNCE_MS);
    });
    const unsubTitle = form.watchValue("title", () => {
      setTitleChanges((n) => n + 1);
    });
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      unsubAll();
      unsubTitle();
    };
  }, [form]);

  const discardDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    form.reset(BLANK);
    setStatus({ kind: "none" });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit(
          (data) => {
            window.alert(`published: ${JSON.stringify(data)}`);
            localStorage.removeItem(STORAGE_KEY);
            setStatus({ kind: "none" });
          },
          (errors) => {
            focusFirstError(errors);
          },
        );
      }}
    >
      <p className="subtitle">
        Draft is restored from localStorage on mount and persisted{" "}
        {DEBOUNCE_MS}ms after each edit. Refresh the page to test restore.
        Title edits: {titleChanges} (tracked via{" "}
        <code>form.watchValue("title", ...)</code>). Changed since the restored
        draft: {dirtyPaths.length > 0 ? dirtyPaths.join(", ") : "nothing"}{" "}
        (from the <code>dirty</code> map; <code>form.diff()</code> would give
        the matching PATCH payload).
      </p>

      <div className="field">
        <label htmlFor="title">Title</label>
        <input {...textInputProps(title)} {...titleA11y.control} />
        <span {...titleA11y.message}>{title.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="body">Body</label>
        <textarea rows={5} {...textInputProps(body)} {...bodyA11y.control} />
        <span {...bodyA11y.message}>{body.error?.[0] ?? " "}</span>
      </div>

      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div
          className="autosave-status"
          role="status"
          style={{ fontSize: 12, color: "var(--text-muted)" }}
        >
          {statusText(status, dirty)}
        </div>
        <div className="row">
          <button
            className="secondary"
            type="button"
            onClick={discardDraft}
          >
            Discard draft
          </button>
          <button className="primary" type="submit">
            Publish
          </button>
        </div>
      </div>
    </form>
  );
};
