import { useEffect, useState } from "react";
import {
  textInputProps,
  useField,
  useForm,
  useFormSelector,
  useFormSelectorShallow,
  useIsDirty,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { z } from "zod";

const STORAGE_KEY = "formstand:autosave-demo";
const DEBOUNCE_MS = 800;

const schema = z.object({
  title: z.string().min(1, "title required"),
  body: z.string().min(1, "body required"),
});

type Values = z.input<typeof schema>;

const loadDraft = (): Values => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { title: "", body: "" };
    const parsed = JSON.parse(raw) as unknown;
    const result = schema.partial().safeParse(parsed);
    if (!result.success) return { title: "", body: "" };
    return { title: result.data.title ?? "", body: result.data.body ?? "" };
  } catch {
    return { title: "", body: "" };
  }
};

export const AutosaveForm = () => {
  const [initial] = useState(loadDraft);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [titleChanges, setTitleChanges] = useState(0);

  const form = useForm(schema, { initialValues: initial, mode: "onBlur" });
  useDemoForm(form);
  const title = useField(form, "title");
  const body = useField(form, "body");
  const values = useFormSelector(form, (s) => s.values);
  const dirty = useIsDirty(form);
  const dirtyPaths = useFormSelectorShallow(form, () => form.dirtyFields());

  useEffect(() => {
    const timerRef: { current: ReturnType<typeof setTimeout> | null } = {
      current: null,
    };
    const unsubAll = form.watchValues((next) => {
      setPending(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setLastSavedAt(Date.now());
        setPending(false);
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
    form.reset({ title: "", body: "" });
    setLastSavedAt(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`published: ${JSON.stringify(data)}`);
          localStorage.removeItem(STORAGE_KEY);
          setLastSavedAt(null);
        });
      }}
    >
      <p className="subtitle">
        Draft is restored from localStorage on mount and persisted{" "}
        {DEBOUNCE_MS}ms after each edit. Refresh the page to test restore.
        Title edits: {titleChanges} (tracked via{" "}
        <code>form.watchValue("title", ...)</code>). Changed since the restored
        draft: {dirtyPaths.length > 0 ? dirtyPaths.join(", ") : "nothing"}{" "}
        (from the <code>dirty</code> map — <code>form.diff()</code> would give
        the matching PATCH payload).
      </p>

      <div className="field">
        <label>Title</label>
        <input {...textInputProps(title)} />
        <span className="error">{title.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label>Body</label>
        <textarea
          rows={5}
          {...textInputProps(body)}
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
        <span className="error">{body.error?.[0] ?? " "}</span>
      </div>

      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ fontSize: 12, color: "#8b94a7" }}>
          {pending
            ? "Saving..."
            : lastSavedAt !== null
              ? `Draft saved at ${new Date(lastSavedAt).toLocaleTimeString()}`
              : dirty || values.title || values.body
                ? "Unsaved changes"
                : "No draft"}
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
