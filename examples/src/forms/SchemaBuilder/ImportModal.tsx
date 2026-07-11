import { useEffect, useRef, useState } from "react";
import { parseTypeScript } from "./parseTypeScript";
import { parseZod } from "./parseZod";

// The Schema builder's import entry: a modal that takes code by paste OR by
// file, in either supported dialect (a TypeScript type or a zod schema), and
// hands the source back to the builder only once it actually parses. Parsing
// here — not just on close — means a bad paste fails inside the modal with the
// real parser error, instead of silently producing an empty form behind it.

export type ImportLang = "ts" | "zod";

export type ImportModalProps = Readonly<{
  initialLang: ImportLang;
  initialSource: string;
  // A worked sample per dialect. Toggling the language swaps the sample in
  // (only while the textarea still holds a sample), so switching to "Zod
  // schema" never leaves a TypeScript sample sitting under it.
  samples: Readonly<Record<ImportLang, string>>;
  onImport: (lang: ImportLang, source: string) => void;
  onClose: () => void;
}>;

const LANG_LABEL: Readonly<Record<ImportLang, string>> = {
  ts: "TypeScript type",
  zod: "Zod schema",
};

// Guess the dialect from a chosen file's content: a zod schema mentions the
// `z.` builder; a bare type/interface does not. Falls back to the current
// choice when neither signal is present.
const detectLang = (source: string, fallback: ImportLang): ImportLang => {
  if (/\bz\s*\.\s*(object|string|number|boolean|date|enum|array)\b/.test(source)) {
    return "zod";
  }
  if (/\b(interface|type)\s+[A-Za-z_$]/.test(source)) return "ts";
  return fallback;
};

const parseFor = (lang: ImportLang, source: string) =>
  lang === "ts" ? parseTypeScript(source) : parseZod(source);

export const ImportModal = ({
  initialLang,
  initialSource,
  samples,
  onImport,
  onClose,
}: ImportModalProps) => {
  const [lang, setLang] = useState<ImportLang>(initialLang);
  const [source, setSource] = useState(initialSource);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape and focus the textarea on open — modal edge behaviour.
  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadFile = (file: File) => {
    void file.text().then((text) => {
      setSource(text);
      setFileName(file.name);
      setLang(detectLang(text, lang));
      setError(null);
    });
  };

  const switchLang = (next: ImportLang) => {
    setLang(next);
    setError(null);
    // Only replace the textarea when it's untouched (empty or still a
    // sample) — never clobber pasted or loaded content.
    const untouched =
      source.trim().length === 0 || source === samples.ts || source === samples.zod;
    if (untouched) {
      setSource(samples[next]);
      setFileName(null);
    }
  };

  const submit = () => {
    const result = parseFor(lang, source);
    if (result.ok) {
      onImport(lang, source);
    } else {
      setError(result.error);
    }
  };

  return (
    <div
      className="import-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <h3 id="import-title" style={{ margin: 0, flex: 1 }}>
            Import a schema
          </h3>
          <button
            className="secondary icon-only"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="builder-modes" role="tablist" aria-label="Source language">
          {(["ts", "zod"] as const).map((value) => (
            <button
              key={value}
              className={`secondary ${lang === value ? "active" : ""}`}
              type="button"
              role="tab"
              aria-selected={lang === value}
              onClick={() => switchLang(value)}
            >
              {LANG_LABEL[value]}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          className="builder-ts-input"
          spellCheck={false}
          rows={12}
          value={source}
          placeholder={
            lang === "ts"
              ? "interface Profile { name: string; age?: number }"
              : "const profileSchema = z.object({ name: z.string() })"
          }
          onChange={(event) => {
            setSource(event.target.value);
            setError(null);
          }}
        />

        <div className="import-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ts,.tsx,.txt,text/plain"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) loadFile(file);
              // Allow re-picking the same file (change fires only on a new value).
              event.target.value = "";
            }}
          />
          <button
            className="secondary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose a file…
          </button>
          <span className="import-filename">
            {fileName ?? "…or paste above. .ts / .tsx / .txt"}
          </span>
          <span style={{ flex: 1 }} />
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={source.trim().length === 0}>
            Import
          </button>
        </div>

        {error !== null ? (
          <p className="error" style={{ marginTop: 10 }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
};
