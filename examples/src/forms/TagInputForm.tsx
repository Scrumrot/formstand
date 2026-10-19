import { type KeyboardEvent, useState } from "react";
import { focusFirstError, useField, useForm } from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "./fieldA11y";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(1, "title required"),
  tags: z.array(z.string().min(1)).min(1, "at least one tag"),
});

export const TagInputForm = () => {
  const form = useForm(schema, {
    initialValues: { title: "", tags: [] },
    mode: "onBlur",
  });
  useDemoForm(form);
  const title = useField(form, "title");
  const tags = useField(form, "tags");
  const [draft, setDraft] = useState("");

  const addTag = () => {
    const next = draft.trim();
    if (next === "") return;
    const current = tags.value as readonly string[];
    if (current.includes(next)) {
      setDraft("");
      return;
    }
    tags.setValue([...current, next]);
    setDraft("");
  };

  const removeTag = (index: number) => {
    const current = tags.value as readonly string[];
    tags.setValue([...current.slice(0, index), ...current.slice(index + 1)]);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  const items = (tags.value as readonly string[] | undefined) ?? [];
  const titleA11y = fieldA11y(title, "title");
  // The array-level message describes the draft input: it is the one
  // control a user interacts with for the tags field.
  const tagsA11y = fieldA11y(tags, "tags");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit(
          (data) => {
            window.alert(`saved ${JSON.stringify(data)}`);
          },
          (errors) => {
            focusFirstError(errors);
          },
        );
      }}
    >
      <p className="subtitle">
        A <code>string[]</code> field managed by <code>useField</code> directly
        (no <code>useFieldArray</code>). Enter or comma adds, × removes.
      </p>

      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          {...titleA11y.control}
          name={title.path}
          value={title.value as string}
          onChange={(e) => title.setValue(e.target.value)}
          onBlur={title.onBlur}
        />
        <span {...titleA11y.message}>{title.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="tags">Tags</label>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: 8,
            background: "#0b0d12",
            border: "1px solid #2a3140",
            borderRadius: 6,
            minHeight: 44,
            alignItems: "center",
          }}
        >
          {items.map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              style={{
                background: "#1f2530",
                color: "#d8dde6",
                padding: "4px 8px",
                borderRadius: 999,
                fontSize: 12,
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(index)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "#8b94a7",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 14,
                }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            {...tagsA11y.control}
            name={tags.path}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => {
              addTag();
              tags.onBlur();
            }}
            placeholder={items.length === 0 ? "add tag..." : ""}
            style={{
              background: "transparent",
              border: 0,
              outline: "none",
              color: "#e6ebf5",
              flex: 1,
              minWidth: 100,
              fontSize: 13,
            }}
          />
        </div>
        <span {...tagsA11y.message}>{tags.error?.[0] ?? " "}</span>
      </div>

      <button className="primary" type="submit">
        Save
      </button>
    </form>
  );
};
