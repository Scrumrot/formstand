import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitPlainForm, emitZodSchema } from "../src/codegen";
import { emitModuleForm } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import { applyFieldOverrides, parseFieldOverrides } from "../src/overrides";
import { freshTmpDir, typecheckDiagnostics } from "./helpers";

// The plain backend's raw controls (the in-file AutocompleteField /
// TextareaField / PlaceholderField / EnumSelectField, the union variant
// leaves, and the module layout's field files) used to render their error
// as a bare `<p role="alert">` with no id, and the input carried no
// aria-describedby, so a screen reader heard the field but never its
// message. formstand's bound components (TextField and friends) already
// wire both. The id derives from the bound path at runtime,
// `${field.path}-error`, the same way the autocomplete datalist id does, so
// array rows get distinct ids without a component boundary (no useId).
// aria-invalid already comes from the prop builders (textInputProps etc.).

const schema = z.object({
  profile: z.object({
    headline: z.string(),
    bio: z.string().optional(),
    city: z.string(),
  }),
  payment: z.discriminatedUnion("method", [
    z.object({ method: z.literal("card"), cardNumber: z.string() }),
    z.object({ method: z.literal("bank"), iban: z.string() }),
  ]),
  tags: z.array(z.string()),
});

const ir = applyFieldOverrides(
  fromZod(schema),
  parseFieldOverrides(
    {
      "profile.bio": { component: "textarea" },
      "profile.city": { component: "autocomplete", optionsProp: true },
    },
    "test",
  ),
  "single",
  1,
);

const schemaImport = {
  name: "profileSchema",
  from: "./profileSchema",
  kind: "named",
} as const;

// The pair every raw control must carry: an aria-describedby that names the
// error id only while the error shows, and an error line that owns that id.
const describedBy = (field: string, pathExpr: string): string =>
  `aria-describedby={${field}.error?.[0] !== undefined ? \`\${${pathExpr}}-error\` : undefined}`;
const errorLine = (pathExpr: string): string =>
  `<p id={\`\${${pathExpr}}-error\`} role="alert">`;

describe("plain backend: error lines are described by id", () => {
  it("wires the in-file controls and the union variant leaves", () => {
    const code = emitPlainForm({ ir, formName: "ProfileForm", schemaImport });
    // In-file components bind `path`, so their id is `${path}-error`.
    expect(code).toContain("const TextareaField = ");
    expect(code).toContain(describedBy("field", "path"));
    expect(code).toContain(errorLine("path"));
    expect(code).toContain("const AutocompleteField = ");
    // Both in-file controls use the same pair, so count the error lines:
    // one per in-file component (textarea, autocomplete).
    expect(code.split(errorLine("path")).length - 1).toBe(2);
    // The union's variant leaves are hoisted field variables, so their id
    // reads the path off the field.
    expect(code).toContain('useVariantField(form, "payment", "cardNumber")');
    expect(code).toContain(
      describedBy("paymentCardNumber", "paymentCardNumber.path"),
    );
    expect(code).toContain(errorLine("paymentCardNumber.path"));
    // No raw error line is left without an id anywhere in the plain output
    // except the array-level line, which describes no single control.
    const bareAlerts = code.match(/<p role="alert">/g) ?? [];
    expect(bareAlerts.length).toBe(1);
    expect(code).toContain(
      '{tagsArray.error ? <p role="alert">{tagsArray.error[0]}</p> : null}',
    );
  });

  it("wires the module layout's field files and array rows", () => {
    const files = emitModuleForm({
      ir,
      formName: "ProfileForm",
      ui: "plain",
      schemaImport,
    });
    const headline = files.find((f) => f.path === "fields/HeadlineField.tsx");
    expect(headline?.content).toContain(describedBy("field", "field.path"));
    expect(headline?.content).toContain(errorLine("field.path"));
    const city = files.find((f) => f.path === "fields/CityField.tsx");
    expect(city?.content).toContain("<datalist id={`${field.path}-datalist`}>");
    expect(city?.content).toContain(describedBy("field", "field.path"));
    const tags = files.find((f) => f.path === "sections/TagsSection.tsx");
    expect(tags?.content).toContain(describedBy("field", "field.path"));
    expect(tags?.content).toContain(errorLine("field.path"));
  });

  it("single-file plain output typechecks with the wiring", () => {
    const dir = freshTmpDir("plain-aria-single");
    const schemaFile = path.join(dir, "profileSchema.ts");
    fs.writeFileSync(schemaFile, emitZodSchema(ir, "profileSchema"), "utf8");
    const out = path.join(dir, "ProfileForm.tsx");
    fs.writeFileSync(
      out,
      emitPlainForm({ ir, formName: "ProfileForm", schemaImport }),
      "utf8",
    );
    expect(typecheckDiagnostics([schemaFile, out])).toEqual([]);
  });

  it("module plain output typechecks with the wiring", () => {
    const dir = freshTmpDir("plain-aria-module");
    const files = emitModuleForm({
      ir,
      formName: "ProfileForm",
      ui: "plain",
      schemaImport: { name: "profileSchema", from: "./s", kind: "named" },
      schemaSource: emitZodSchema(ir, "profileSchema"),
    });
    const written = files.map((file) => {
      const dest = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});
