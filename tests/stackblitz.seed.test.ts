// The "Open in StackBlitz" seed hard-codes the toolchain versions of the
// project it POSTs, and those versions are never installed here, so nothing
// else in the suite notices when they drift apart. They did once: the seed
// paired @vitejs/plugin-react ^6 (which requires vite 8) with vite ^7, so
// every seeded project failed `npm install` and its dev server died with
// ERR_PACKAGE_PATH_NOT_EXPORTED. This pins the seed's vite/plugin-react pair
// to the ranges examples/package.json resolves, which the playground build
// exercises on every CI run.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import examplesPackage from "../examples/package.json" with { type: "json" };
import {
  canOpenInStackBlitz,
  openInStackBlitz,
} from "../examples/src/demo/stackblitz";

const DEMO_FILES = [
  {
    path: "WizardForm.tsx",
    source: `import { useForm } from "formstand";\nexport const WizardForm = () => null;\n`,
  },
] as const;

// openInStackBlitz builds a hidden <form>, submits it into a new tab, and
// removes it. jsdom does not implement form submission (and the real thing
// would navigate), so capture the form at the submit call instead and read
// the project fields back out of it.
const seededFiles = (): Readonly<Record<string, string>> => {
  const captured: HTMLFormElement[] = [];
  const submit = vi
    .spyOn(HTMLFormElement.prototype, "submit")
    .mockImplementation(function (this: HTMLFormElement) {
      captured.push(this);
    });
  openInStackBlitz("Wizard", DEMO_FILES);
  submit.mockRestore();
  const form = captured[0];
  if (form === undefined) throw new Error("openInStackBlitz never submitted");
  const prefix = "project[files][";
  return Object.fromEntries(
    Array.from(form.querySelectorAll("input"))
      .filter((input) => input.name.startsWith(prefix))
      .map((input) => [input.name.slice(prefix.length, -1), input.value]),
  );
};

describe("StackBlitz seed toolchain", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a self-contained demo", () => {
    expect(canOpenInStackBlitz(DEMO_FILES)).toBe(true);
  });

  it("pins vite and @vitejs/plugin-react to the playground's own ranges", () => {
    const files = seededFiles();
    const seeded = JSON.parse(files["package.json"] ?? "{}") as {
      devDependencies?: Record<string, string>;
    };
    const expected = examplesPackage.devDependencies;
    expect(seeded.devDependencies?.["vite"]).toBe(expected.vite);
    expect(seeded.devDependencies?.["@vitejs/plugin-react"]).toBe(
      expected["@vitejs/plugin-react"],
    );
  });

  it("always depends on react and react-dom, since main.tsx renders through them", () => {
    // DEMO_FILES imports neither: the seed used to list only the demo's own
    // imports, and vite then failed on main.tsx's "react-dom/client".
    const files = seededFiles();
    const seeded = JSON.parse(files["package.json"] ?? "{}") as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(seeded.dependencies ?? {}).sort()).toEqual([
      "formstand",
      "react",
      "react-dom",
    ]);
  });

  it("seeds an entry that renders the demo's root export", () => {
    const files = seededFiles();
    expect(files["src/main.tsx"]).toContain(
      `import { WizardForm } from "./WizardForm";`,
    );
    expect(files["index.html"]).toContain("<title>Wizard | formstand</title>");
  });
});
