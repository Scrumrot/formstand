import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  emitAntdForm,
  emitChakraForm,
  emitMantineForm,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
  emitZodSchema,
} from "../src/codegen";
import { emitModuleForm } from "../src/moduleLayout";
import { applyFieldOverrides, parseFieldOverrides } from "../src/overrides";
import { fromZod } from "../src/fromZod";
import {
  chakraStubPaths,
  freshTmpDir,
  muiStubPaths,
  typecheckDiagnostics,
} from "./helpers";

// Per-field layout placement (formstand.config.ts `fields` span): config
// parsing, validation against placements that cannot reach a grid, and the
// per-ui cell each backend emits — one dialect per kit, same clamp rule.

const spanSchema = z.object({
  reference: z.string(),
  employment: z.object({
    jobTitle: z.string(),
    department: z.enum(["eng", "ops"]),
    salary: z.number(),
    notes: z.string(),
  }),
  contacts: z.array(z.object({ name: z.string() })),
});
const baseIr = fromZod(spanSchema);

const emitOptions = (ir: ReturnType<typeof fromZod>, columns: 2 | 3) =>
  ({
    ir,
    formName: "SpanForm",
    schemaImport: { name: "s", from: "./schema", kind: "named" },
    visual: { sections: "flat", columns },
  }) as const;

describe("span config parsing", () => {
  it("rejects non-span values and empty entries loudly", () => {
    expect(() =>
      parseFieldOverrides({ "employment.notes": { span: 1 } }, "cfg"),
    ).toThrow(/span must be "full" or an integer >= 2/);
    expect(() =>
      parseFieldOverrides({ "employment.notes": { span: "half" } }, "cfg"),
    ).toThrow(/span must be "full" or an integer >= 2/);
    expect(() => parseFieldOverrides({ "employment.notes": {} }, "cfg")).toThrow(
      /must set component and\/or span/,
    );
    // optionsProp feeds a component override; without one it is dead config.
    expect(() =>
      parseFieldOverrides({ "employment.notes": { optionsProp: true, span: 2 } }, "cfg"),
    ).toThrow(/optionsProp requires a component override/);
  });

  it("accepts span alone, and span beside a component override", () => {
    expect(parseFieldOverrides({ a: { span: "full" } }, "cfg")).toEqual({
      a: { span: "full" },
    });
    expect(
      parseFieldOverrides(
        { a: { component: "autocomplete", optionsProp: true, span: 2 } },
        "cfg",
      ),
    ).toEqual({ a: { component: "autocomplete", optionsProp: true, span: 2 } });
  });
});

describe("span validation against the walked IR", () => {
  it("rejects every placement without a grid to act on", () => {
    // Root fields stack in every layout.
    expect(() =>
      applyFieldOverrides(baseIr, { reference: { span: "full" } }, "single", 2),
    ).toThrow(/root-level fields stack vertically/);
    // Array rows are per-row stacks.
    expect(() =>
      applyFieldOverrides(baseIr, { "contacts.*.name": { span: 2 } }, "single", 2),
    ).toThrow(/array rows stack vertically/);
    // A 1-column form has no grid at all.
    expect(() =>
      applyFieldOverrides(baseIr, { "employment.notes": { span: "full" } }, "single", 1),
    ).toThrow(/span needs a multi-column form/);
    // Containers already span the row.
    expect(() =>
      applyFieldOverrides(baseIr, { employment: { span: "full" } }, "single", 2),
    ).toThrow(/containers \(kind "object"\) already span the full row/);
  });

  it("module layout only grids a section's direct fields; single-file grids every level", () => {
    const deep = z.object({
      shipping: z.object({
        address: z.object({ street: z.string(), city: z.string() }),
      }),
    });
    const deepIr = fromZod(deep);
    expect(() =>
      applyFieldOverrides(deepIr, { "shipping.address.city": { span: 2 } }, "module", 2),
    ).toThrow(/only a section's direct fields sit in its grid/);
    // Single-file: every nested object renders its own grid, so it passes.
    expect(() =>
      applyFieldOverrides(deepIr, { "shipping.address.city": { span: 2 } }, "single", 2),
    ).not.toThrow();
  });
});

describe("span emission per ui", () => {
  const spanned = applyFieldOverrides(
    baseIr,
    { "employment.notes": { span: "full" }, "employment.jobTitle": { span: 2 } },
    "single",
    3,
  );

  it("kit grids replace the item cell; a span at the column count is the full row", () => {
    const mui = emitMuiForm(emitOptions(spanned, 3));
    expect(mui).toMatch(/<Grid size=\{12\}>\s*<BoundTextField form=\{form\} path=\{"employment\.notes"\}/);
    expect(mui).toMatch(/<Grid size=\{\{ xs: 12, sm: 8 \}\}>\s*<BoundTextField form=\{form\} path=\{"employment\.jobTitle"\}/);

    // v5 spells the same cells with the legacy item/xs/sm grid.
    const mui5 = emitMuiForm({ ...emitOptions(spanned, 3), muiVersion: 5 });
    expect(mui5).toMatch(/<Grid item xs=\{12\} sm=\{8\}>\s*<BoundTextField form=\{form\} path=\{"employment\.jobTitle"\}/);

    const antd = emitAntdForm(emitOptions(spanned, 3));
    expect(antd).toMatch(/<Col span=\{24\}>\s*<BoundTextField form=\{form\} path=\{"employment\.notes"\}/);
    expect(antd).toMatch(/<Col xs=\{24\} sm=\{16\}>\s*<BoundTextField form=\{form\} path=\{"employment\.jobTitle"\}/);

    const mantine = emitMantineForm(emitOptions(spanned, 3));
    expect(mantine).toMatch(/<Grid\.Col span=\{12\}>\s*<BoundTextField form=\{form\} path=\{"employment\.notes"\}/);
    expect(mantine).toMatch(/<Grid\.Col span=\{\{ base: 12, sm: 8 \}\}>\s*<BoundTextField form=\{form\} path=\{"employment\.jobTitle"\}/);
  });

  it("CSS grids wrap the leaf; plain degrades a partial span with a comment", () => {
    const shadcn = emitShadcnForm(emitOptions(spanned, 3));
    expect(shadcn).toMatch(/<div className="md:col-span-full">\s*<BoundTextField form=\{form\} path=\{"employment\.notes"\}/);
    expect(shadcn).toMatch(/<div className="md:col-span-2">\s*<BoundTextField form=\{form\} path=\{"employment\.jobTitle"\}/);

    const chakra = emitChakraForm(emitOptions(spanned, 3));
    expect(chakra).toMatch(/<Box gridColumn="1 \/ -1">\s*<BoundTextField form=\{form\} path=\{"employment\.notes"\}/);
    expect(chakra).toMatch(/<Box gridColumn=\{\{ md: "span 2" \}\}>\s*<BoundTextField form=\{form\} path=\{"employment\.jobTitle"\}/);

    const plain = emitPlainForm(emitOptions(spanned, 3));
    expect(plain).toMatch(/<div style=\{\{ gridColumn: "1 \/ -1" \}\}>\s*<TextField form=\{form\} path=\{"employment\.notes"\}/);
    // The partial span cannot be responsive in inline styles: full row + note.
    expect(plain).toContain(
      "{/* span 2 widened to the full row: plain inline styles cannot express a responsive partial span */}",
    );
    expect(plain).not.toContain('gridColumn: "span 2"');
  });

  it("spanned single-file output typechecks against the kit stubs", () => {
    const dir = freshTmpDir("span-single");
    fs.writeFileSync(
      path.join(dir, "schema.ts"),
      emitZodSchema(spanned, "s"),
      "utf8",
    );
    const muiFile = path.join(dir, "SpanMuiForm.tsx");
    fs.writeFileSync(
      muiFile,
      emitMuiForm({ ...emitOptions(spanned, 3), formName: "SpanMuiForm" }),
      "utf8",
    );
    expect(typecheckDiagnostics([muiFile], muiStubPaths)).toEqual([]);
    const chakraFile = path.join(dir, "SpanChakraForm.tsx");
    fs.writeFileSync(
      chakraFile,
      emitChakraForm({ ...emitOptions(spanned, 3), formName: "SpanChakraForm" }),
      "utf8",
    );
    expect(typecheckDiagnostics([chakraFile], chakraStubPaths)).toEqual([]);
  });

  it("a span composes with an autocomplete override on the same field", () => {
    const combined = applyFieldOverrides(
      baseIr,
      {
        "employment.jobTitle": {
          component: "autocomplete",
          optionsProp: true,
          span: "full",
        },
      },
      "single",
      2,
    );
    const mui = emitMuiForm(emitOptions(combined, 2));
    // The autocomplete control (and its site comment) ride inside the
    // spanning cell, and the options prop still threads through.
    expect(mui).toMatch(
      /<Grid size=\{12\}>\s*\{\/\* autocomplete override[\s\S]{0,200}<BoundAutocompleteField[\s\S]{0,200}options=\{employmentJobTitleOptions\}/,
    );
  });
});

describe("span emission in the module layout", () => {
  const spanned = applyFieldOverrides(
    baseIr,
    { "employment.notes": { span: "full" }, "employment.jobTitle": { span: 2 } },
    "module",
    3,
  );
  const files = (ui: "mui" | "chakra" | "plain") =>
    emitModuleForm({
      ir: spanned,
      formName: "SpanForm",
      ui,
      schemaImport: { name: "s", from: "./schema", kind: "named" },
      schemaSource: emitZodSchema(spanned, "s"),
      visual: { sections: "flat", columns: 3 },
    });

  it("kit sections replace the item cell; chakra imports the Box its span needs", () => {
    const muiSection = files("mui").find(
      (f) => f.path === "sections/EmploymentSection.tsx",
    );
    expect(muiSection?.content).toMatch(/<Grid size=\{12\}>\s*<NotesField \/>/);
    expect(muiSection?.content).toMatch(/<Grid size=\{\{ xs: 12, sm: 8 \}\}>\s*<JobTitleField \/>/);

    const chakraSection = files("chakra").find(
      (f) => f.path === "sections/EmploymentSection.tsx",
    );
    expect(chakraSection?.content).toMatch(/<Box gridColumn="1 \/ -1">\s*<NotesField \/>/);
    expect(chakraSection?.content).toMatch(
      /import \{[^}]*\bBox\b[^}]*\} from "@chakra-ui\/react"/s,
    );
  });

  it("module output with spans typechecks end to end", () => {
    const dir = freshTmpDir("span-module");
    const written = files("plain").map((file) => {
      const dest = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});
