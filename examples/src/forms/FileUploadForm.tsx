import {
  focusFirstError,
  useField,
  useForm,
  useFormSelector,
} from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { fieldA11y } from "./fieldA11y";
import { z } from "zod";

const MAX_BYTES = 1_000_000;

const schema = z.object({
  caption: z.string().min(1, "caption required"),
  file: z
    .instanceof(File, { message: "pick a file" })
    .refine((f) => f.size <= MAX_BYTES, "max 1MB"),
});

type Values = z.input<typeof schema>;

export const FileUploadForm = () => {
  const form = useForm(schema, {
    initialValues: { caption: "", file: undefined as unknown as File },
    mode: "onBlur",
  });
  useDemoForm(form);
  const caption = useField(form, "caption");
  const file = useField(form, "file");
  const isSubmitting = useFormSelector(form, (s) => s.isSubmitting);
  const captionA11y = fieldA11y(caption, "caption");
  const fileA11y = fieldA11y(file, "file");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit(
          async (data: Values) => {
            await new Promise((r) => setTimeout(r, 400));
            window.alert(
              `uploaded ${(data.file as File).name} (${(data.file as File).size} bytes) with caption: ${data.caption}`,
            );
          },
          (errors) => {
            focusFirstError(errors);
          },
        );
      }}
    >
      <p className="subtitle">
        File objects survive the immutable spread (reference is preserved).
        Persistence/autosave wouldn't work here without a custom serializer;
        File isn't JSON-encodable.
      </p>

      <div className="field">
        <label htmlFor="caption">Caption</label>
        <input
          {...captionA11y.control}
          name={caption.path}
          value={caption.value ?? ""}
          onChange={(e) => caption.setValue(e.target.value)}
          onBlur={caption.onBlur}
        />
        <span {...captionA11y.message}>{caption.error?.[0] ?? " "}</span>
      </div>

      <div className="field">
        <label htmlFor="file">File</label>
        <input
          {...fileA11y.control}
          name={file.path}
          type="file"
          onChange={(e) => {
            const next = e.target.files?.[0];
            file.setValue((next ?? undefined) as File);
          }}
          onBlur={file.onBlur}
        />
        <div
          style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}
        >
          {file.value instanceof File
            ? `${(file.value as File).name} (${(file.value as File).size} bytes)`
            : "no file selected"}
        </div>
        <span {...fileA11y.message}>{file.error?.[0] ?? " "}</span>
      </div>

      <button className="primary" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
};
