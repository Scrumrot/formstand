import { describe, expect, it } from "vitest";
// Import ONLY through the public browser-safe subpath surface (src/codegen-api
// is what `formstand-cli/codegen` resolves to). This pins that the barrel
// exports everything a consumer needs to run the generator end to end, and
// that none of it drags in Node — the module graph is checked for browser
// safety by the esbuild bundle step in CI's build, this asserts the API.
import {
  DEFAULT_VISUAL,
  type EmitFormOptions,
  type FieldOverrideConfig,
  type FieldOverrideSpec,
  type FieldOverrides,
  type FieldSpec,
  applyFieldOverrides,
  camelCase,
  collectOptionsProps,
  defineTemplate,
  emitModuleForm,
  emitMuiForm,
  emitPlainForm,
  emitZodSchema,
  fromZod,
  joinModuleFiles,
  labelFromName,
  parseFieldOverrides,
} from "../src/codegen-api";
import * as codegenApi from "../src/codegen-api";
import { z } from "zod";

const schema = z.object({
  fullName: z.string(),
  age: z.number(),
  role: z.enum(["admin", "editor"]),
});

const importFor = (name: string): EmitFormOptions["schemaImport"] => ({
  name,
  from: "./schema",
  kind: "named",
});

describe("codegen-api (the browser-safe formstand-cli/codegen surface)", () => {
  it("runs the full zod → IR → emit pipeline", () => {
    const ir = fromZod(schema);
    expect(ir.kind).toBe("object");
    const code = emitPlainForm({ ir, formName: "ProfileForm", schemaImport: importFor("s") });
    expect(code).toContain("export const ProfileForm = () => {");
    expect(code).toContain("useForm(s");
  });

  it("exposes every emitter and the naming helpers", () => {
    const ir = fromZod(schema);
    expect(emitMuiForm({ ir, formName: "F", schemaImport: importFor("s") })).toContain(
      "@mui/material",
    );
    expect(emitZodSchema(ir, "s")).toContain("z.object({");
    const files = emitModuleForm({
      ir,
      formName: "ProfileForm",
      schemaImport: importFor("profileSchema"),
      schemaSource: emitZodSchema(ir, "profileSchema"),
    });
    expect(joinModuleFiles(files)).toContain("// --- file: hooks.ts");
    expect(camelCase("full-name")).toBe("fullName");
    expect(labelFromName("fullName")).toBe("Full Name");
    expect(DEFAULT_VISUAL).toEqual({ sections: "flat", columns: 1 });
  });

  it("exposes the override surface: parse, apply, and the options-prop walk", () => {
    // parseFieldOverrides shape-validates a raw config block...
    const parsed: FieldOverrides = parseFieldOverrides(
      { fullName: { component: "autocomplete", optionsProp: true } },
      "test",
    );
    const config: FieldOverrideConfig | undefined = parsed["fullName"];
    expect(config?.component).toBe("autocomplete");
    // ...applyFieldOverrides stamps the walked IR (FieldOverrideSpec is the
    // stamped shape)...
    const ir = applyFieldOverrides(fromZod(schema), parsed);
    const stamped: FieldOverrideSpec | undefined =
      ir.kind === "object"
        ? ir.fields.find((f) => f.name === "fullName")?.spec.override
        : undefined;
    expect(stamped).toEqual({
      component: "autocomplete",
      optionsPropName: "fullNameOptions",
    });
    // ...and collectOptionsProps lists the generated props for consumers.
    expect(collectOptionsProps(ir)).toEqual([
      { name: "fullNameOptions", path: "fullName" },
    ]);
    // The emitters render the override through the public pipeline.
    expect(
      emitPlainForm({ ir, formName: "F", schemaImport: importFor("s") }),
    ).toContain("fullNameOptions: readonly string[];");
    // overridablePaths left the public surface (internal near-miss walk).
    expect("overridablePaths" in codegenApi).toBe(false);
  });

  it("exposes defineTemplate and builds against a hand-made IR", () => {
    const template = defineTemplate({
      name: "t",
      leaf: { string: ({ label, bind }) => `<X label={${label}} {...${bind}} />` },
    });
    expect(template.name).toBe("t");
    // A hand-built FieldSpec (no fromZod) also emits — the IR is the contract.
    const ir: FieldSpec = {
      kind: "object",
      optional: false,
      nullable: false,
      fields: [
        { name: "note", label: "Note", spec: { kind: "string", optional: false, nullable: false } },
      ],
    };
    expect(emitPlainForm({ ir, formName: "NoteForm", schemaImport: importFor("s") })).toContain(
      "NoteForm",
    );
  });
});
