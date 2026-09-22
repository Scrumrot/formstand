import type { DemoFile } from "./demoSources";

// "Open in StackBlitz": seed a fresh Vite + React project with a demo's
// own (harness-stripped) sources plus formstand from npm, and POST it to
// StackBlitz's project API. No SDK dependency: the API is an HTML form
// POST to https://stackblitz.com/run with project[...] fields, submitted
// into a new tab. DOM work happens only inside the click handler, so the
// module stays SSR-safe for the docs build that also imports it.

// The bare specifiers a SELF-CONTAINED demo may import, with the versions
// the seeded package.json pins. Kit demos import sibling adapters and ui/
// files that are not part of their DemoFile set, so they never pass
// canOpenInStackBlitz — which is the honest scope: the roadmap item is
// "the demo source plus formstand from npm", not a rebuild of the
// playground's kit scaffolding.
const KNOWN_DEPS: Readonly<Record<string, Readonly<Record<string, string>>>> =
  {
    formstand: { formstand: "latest" },
    zod: { zod: "^4.0.0" },
    react: { react: "^19.0.0" },
    "react-dom": { "react-dom": "^19.0.0" },
  };

const IMPORT_RE = /(?:from|import)\s+"([^"]+)"/g;

const specifiersOf = (source: string): readonly string[] =>
  [...source.matchAll(IMPORT_RE)].map((match) => match[1] ?? "");

// Resolve a relative import against the importing file's directory, the
// way the bundler will inside the seeded project: exact file, with a
// .ts/.tsx extension added, or a directory index.
const resolvesWithin = (
  files: readonly DemoFile[],
  fromPath: string,
  specifier: string,
): boolean => {
  const dir = fromPath.split("/").slice(0, -1);
  const joined = specifier.split("/").reduce<readonly string[]>(
    (parts, segment) =>
      segment === "."
        ? parts
        : segment === ".."
          ? parts.slice(0, -1)
          : [...parts, segment],
    dir,
  );
  const base = joined.join("/");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  return files.some((file) => candidates.includes(file.path));
};

// A demo can open standalone when every import resolves: bare specifiers
// against the known dependency set (subpaths like "formstand/testing"
// count under their package), relative ones within the demo's own files.
export const canOpenInStackBlitz = (files: readonly DemoFile[]): boolean =>
  files.every((file) =>
    specifiersOf(file.source).every((specifier) => {
      if (specifier.startsWith(".")) {
        return resolvesWithin(files, file.path, specifier);
      }
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : (specifier.split("/")[0] ?? specifier);
      return packageName in KNOWN_DEPS;
    }),
  );

// The demo's dependency slice: only the packages its sources actually
// import (formstand always, since every demo binds a form).
const dependenciesOf = (
  files: readonly DemoFile[],
): Readonly<Record<string, string>> =>
  files
    .flatMap((file) => specifiersOf(file.source))
    .filter((specifier) => !specifier.startsWith("."))
    .map((specifier) =>
      specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : (specifier.split("/")[0] ?? specifier),
    )
    .reduce<Readonly<Record<string, string>>>(
      (acc, name) => ({ ...acc, ...(KNOWN_DEPS[name] ?? {}) }),
      KNOWN_DEPS["formstand"] ?? {},
    );

// The component the seeded app renders: the root-level *Form.tsx (module
// demos keep sections/fields in subfolders), else the first file. The
// export name is read from the source, so the entry file needs no rename.
const entryOf = (
  files: readonly DemoFile[],
): Readonly<{ path: string; exportName: string }> => {
  const entry =
    files.find(
      (file) => !file.path.includes("/") && file.path.endsWith("Form.tsx"),
    ) ?? files[0];
  const match = entry === undefined
    ? null
    : /export const ([A-Z][A-Za-z0-9]*)/.exec(entry.source);
  return {
    path: entry?.path ?? "Demo.tsx",
    exportName: match?.[1] ?? "Demo",
  };
};

// A compact standalone stylesheet for the class names the demos use
// (field/error/subtitle/primary/secondary/card) — enough to look
// intentional outside the playground's full shell.
const DEMO_CSS = `:root { color-scheme: dark; }
body { margin: 0; padding: 32px; background: #0b0d12; color: #e6ebf5;
  font: 14px/1.5 system-ui, sans-serif; }
form { max-width: 560px; display: grid; gap: 4px; }
.field { display: grid; gap: 4px; margin-bottom: 8px; }
.field label { font-size: 13px; color: #9aa7bd; }
.field input, .field select, .field textarea { background: #12151c;
  border: 1px solid #2a3140; color: #e6ebf5; padding: 10px 12px;
  border-radius: 6px; font-size: 14px; }
.error { color: #f28b82; font-size: 12px; min-height: 16px; }
.subtitle { color: #9aa7bd; font-size: 13px; }
button { background: #1a1f29; border: 1px solid #2a3140; color: #e6ebf5;
  padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 14px; }
button.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
button:disabled { opacity: 0.5; cursor: default; }
`;

const projectFiles = (
  title: string,
  files: readonly DemoFile[],
): Readonly<Record<string, string>> => {
  const entry = entryOf(files);
  const deps = dependenciesOf(files);
  return {
    ...Object.fromEntries(
      files.map((file) => [`src/${file.path}`, file.source]),
    ),
    "src/main.tsx": [
      `import { createRoot } from "react-dom/client";`,
      `import "./styles.css";`,
      `import { ${entry.exportName} } from "./${entry.path.replace(/\.tsx?$/, "")}";`,
      "",
      `createRoot(document.getElementById("root")!).render(<${entry.exportName} />);`,
      "",
    ].join("\n"),
    "src/styles.css": DEMO_CSS,
    "index.html": [
      "<!doctype html>",
      `<html lang="en">`,
      `  <head><meta charset="UTF-8" /><title>${title} — formstand</title></head>`,
      `  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>`,
      "</html>",
      "",
    ].join("\n"),
    "package.json": JSON.stringify(
      {
        name: "formstand-demo",
        private: true,
        type: "module",
        scripts: { dev: "vite", build: "tsc --noEmit && vite build" },
        dependencies: deps,
        devDependencies: {
          "@types/react": "^19.0.0",
          "@types/react-dom": "^19.0.0",
          "@vitejs/plugin-react": "^6.0.0",
          typescript: "^5.9.0",
          vite: "^7.0.0",
        },
        stackblitz: { startCommand: "npm run dev" },
      },
      null,
      2,
    ),
    "vite.config.ts": [
      `import react from "@vitejs/plugin-react";`,
      `import { defineConfig } from "vite";`,
      "",
      "export default defineConfig({ plugins: [react()] });",
      "",
    ].join("\n"),
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          lib: ["ES2022", "DOM", "DOM.Iterable"],
        },
        include: ["src"],
      },
      null,
      2,
    ),
  };
};

export const openInStackBlitz = (
  title: string,
  files: readonly DemoFile[],
): void => {
  const form = document.createElement("form");
  form.method = "post";
  form.action = "https://stackblitz.com/run";
  form.target = "_blank";
  const add = (name: string, value: string): void => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };
  add("project[title]", `formstand: ${title}`);
  add(
    "project[description]",
    "A formstand playground demo, seeded with the library from npm.",
  );
  add("project[template]", "node");
  Object.entries(projectFiles(title, files)).forEach(([path, content]) => {
    add(`project[files][${path}]`, content);
  });
  document.body.appendChild(form);
  form.submit();
  form.remove();
};
