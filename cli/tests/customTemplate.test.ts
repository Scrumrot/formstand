import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { moduleSpecifier } from "../src/cli";
import {
  type EmitFormOptions,
  emitTemplateForm,
  emitZodSchema,
} from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { type Template } from "../src/template";
import {
  freshTmpDir,
  mantineStubPaths,
  typecheckDiagnostics,
} from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";

// A Mantine-ish template: overrides string/number/boolean/enum with Mantine
// controls, leaves `date` to fall back to plain's raw <input>. The boolean
// leaf returns an array of lines (the multi-line output path); the two import
// entries for "@mantine/core" exercise the import merge/dedupe.
const mantineTemplate: Template = {
  name: "mantine",
  imports: [
    { from: "@mantine/core", names: ["TextInput", "NumberInput", "TextInput"] },
    { from: "@mantine/core", names: ["Checkbox", "Select"] },
  ],
  leaf: {
    string: ({ label, bind }) => `<TextInput label={${label}} {...${bind}} />`,
    number: ({ label, bind }) =>
      `<NumberInput label={${label}} {...${bind}} />`,
    boolean: ({ label, bind }) => [
      `<Checkbox`,
      `  label={${label}}`,
      `  {...${bind}}`,
      `/>`,
    ],
    enum: ({ label, bind, options }) =>
      `<Select label={${label}} data={${options}} {...${bind}} />`,
    // date intentionally omitted → falls back to the plain backend.
  },
};

// Every scalar kind, an optional field, an enum, a nested object, an array,
// and a discriminated union — so the wrapper, fallback, and variant paths are
// all exercised in one emitted component.
const kitchenSinkSchema = z.object({
  name: z.string(),
  age: z.number(),
  subscribed: z.boolean(),
  role: z.enum(["admin", "editor", "viewer"]),
  // date is NOT overridden by the template → plain fallback.
  birthday: z.date().optional(),
  address: z.object({
    street: z.string(),
    city: z.string(),
  }),
  tags: z.array(
    z.object({
      value: z.string(),
      priority: z.number(),
    }),
  ),
  payment: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("card"),
      cardNumber: z.string(),
      installments: z.number(),
    }),
    z.object({
      method: z.literal("paypal"),
      email: z.string(),
    }),
    z.object({
      method: z.literal("invoice"),
      terms: z.enum(["net30", "net60"]),
    }),
  ]),
});

const emit = (
  template: Template,
  schema: unknown,
  schemaName: string,
  formName: string,
  dir: string,
): Readonly<{ file: string; code: string }> => {
  const ir = fromZod(schema);
  // The inline schema needs a real module on disk for the generated import to
  // resolve during typecheck; write it next to the component.
  const schemaFile = path.join(dir, `${schemaName}.ts`);
  fs.writeFileSync(schemaFile, emitZodSchema(ir, schemaName), "utf8");
  const options: EmitFormOptions = {
    ir,
    formName,
    schemaImport: {
      name: schemaName,
      from: moduleSpecifier(dir, schemaFile),
      kind: "named",
    },
  };
  const code = emitTemplateForm(template, options);
  const file = path.join(dir, `${formName}.tsx`);
  fs.writeFileSync(file, code, "utf8");
  return { file, code };
};

describe("emitTemplateForm", () => {
  const dir = freshTmpDir("custom-template");
  const kitchenSink = emit(
    mantineTemplate,
    kitchenSinkSchema,
    "kitchenSinkSchema",
    "KitchenSinkForm",
    dir,
  );

  it("imports the template's controls, not the plain leaf components", () => {
    expect(kitchenSink.code).toContain('from "@mantine/core"');
    // The plain leaf COMPONENTS the template replaces must not be imported
    // or rendered (BoundTextField/BoundNumberField are distinct names).
    expect(kitchenSink.code).not.toContain("  TextField,");
    expect(kitchenSink.code).not.toContain("  NumberField,");
    expect(kitchenSink.code).not.toContain("<TextField ");
    expect(kitchenSink.code).not.toContain("<NumberField ");
  });

  it("renders the template markup inside the Bound wrappers", () => {
    // The string wrapper body is the template's own control.
    expect(kitchenSink.code).toContain(
      "const BoundTextField = ({ form, path, label }: BoundFieldProps) => {",
    );
    expect(kitchenSink.code).toContain("<TextInput label={label}");
    expect(kitchenSink.code).toContain("<NumberInput label={label}");
    // The multi-line boolean leaf.
    expect(kitchenSink.code).toContain("<Checkbox");
    // The enum wrapper takes and forwards the options prop.
    expect(kitchenSink.code).toContain("<Select label={label} data={options}");
    // The import merge collapsed the two "@mantine/core" entries into one line.
    const mantineImports = kitchenSink.code
      .split("\n")
      .filter((line) => line.includes('from "@mantine/core"'));
    expect(mantineImports).toHaveLength(1);
    expect(mantineImports[0]).toContain(
      "TextInput, NumberInput, Checkbox, Select",
    );
  });

  it("falls back to plain rendering for an unlisted kind (date)", () => {
    // date is not overridden: plain raw <input> via dateInputProps, no Mantine.
    expect(kitchenSink.code).toContain("dateInputProps");
    expect(kitchenSink.code).toContain("<input {...dateInputProps(field)} />");
  });

  it("renders the discriminated union from hoisted hooks", () => {
    // Variant fields render the template control from the hoisted variable,
    // with a quoted label and (for enum) an array-literal options.
    expect(kitchenSink.code).toContain(
      "<TextInput label={\"Card Number\"} {...textInputProps(paymentCardNumber)} />",
    );
    expect(kitchenSink.code).toContain(
      '<Select label={"Terms"} data={["net30", "net60"]}',
    );
  });

  // THE BAR: the emitted component typechecks against the library source and
  // the Mantine stub, with the union variant path included.
  it("output typechecks against the library source and the Mantine stub", () => {
    expect(
      typecheckDiagnostics([kitchenSink.file], mantineStubPaths),
    ).toEqual([]);
  });

  // An override-just-one-kind template: every other kind falls back to plain
  // and the whole thing still typechecks.
  it("an unlisted-only template still generates a working, typechecking form", () => {
    const stringOnly: Template = {
      name: "string-only",
      imports: [{ from: "@mantine/core", names: ["TextInput"] }],
      leaf: {
        string: ({ label, bind }) =>
          `<TextInput label={${label}} {...${bind}} />`,
      },
    };
    const generated = emit(
      stringOnly,
      profileSchema,
      "profileSchema",
      "StringOnlyForm",
      dir,
    );
    // Overridden kind uses the Mantine control...
    expect(generated.code).toContain("<TextInput label={label}");
    // ...every other kind falls back to plain's raw controls.
    expect(generated.code).toContain("numberInputProps");
    expect(generated.code).toContain("checkboxProps");
    expect(generated.code).toContain("<select {...selectProps(field)}>");
    expect(generated.code).not.toContain("<NumberInput");
    expect(generated.code).not.toContain("<Checkbox");
    expect(typecheckDiagnostics([generated.file], mantineStubPaths)).toEqual(
      [],
    );
  });
});
