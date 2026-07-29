import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type EmitFormOptions,
  emitAntdForm,
  emitChakraForm,
  emitMantineForm,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
  emitTemplateForm,
  emitZodSchema,
} from "../src/codegen";
import { fromType } from "../src/fromType";
import { fromZod } from "../src/fromZod";
import type { FieldSpec } from "../src/ir";
import { type ModuleUi, emitModuleForm } from "../src/moduleLayout";
import { defineTemplate } from "../src/template";
import {
  antdStubPaths,
  chakraStubPaths,
  fixturesDir,
  freshTmpDir,
  mantineStubPaths,
  muiStubPaths,
  shadcnStubFile,
  typecheckDiagnostics,
} from "./helpers";
import { describedSchema } from "./fixtures/describedSchema";
import { profileSchema } from "./fixtures/profileSchema";

const descriptionOf = (spec: FieldSpec): string | undefined =>
  spec.description;

const fieldSpec = (root: FieldSpec, name: string): FieldSpec => {
  if (root.kind !== "object") throw new Error("expected object root");
  const field = root.fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`no field ${name}`);
  return field.spec;
};

// ---------------------------------------------------------------------------
// IR capture
// ---------------------------------------------------------------------------

describe("fromZod description capture", () => {
  const walkOne = (schema: unknown): FieldSpec =>
    fieldSpec(fromZod(z.object({ a: schema as z.ZodType })), "a");

  it("captures .describe() (zod v4 stores it in the meta registry)", () => {
    expect(descriptionOf(walkOne(z.number().positive().describe("1,000 lbs")))).toBe(
      "1,000 lbs",
    );
  });

  it("captures .meta({ description }) — the same registry store", () => {
    expect(
      descriptionOf(walkOne(z.number().meta({ description: "gallons usable" }))),
    ).toBe("gallons usable");
    // Non-description meta keys are ignored.
    expect(
      descriptionOf(walkOne(z.number().meta({ title: "GW", examples: [1] }))),
    ).toBeUndefined();
  });

  it("captures through wrappers, in both orders", () => {
    // Entry on the INNER type (the wrapper is a new schema object without one).
    const inner = walkOne(z.number().describe("inner").optional());
    expect(descriptionOf(inner)).toBe("inner");
    expect(inner.optional).toBe(true);
    // Entry on the OUTER wrapper.
    const outer = walkOne(z.number().optional().describe("outer"));
    expect(descriptionOf(outer)).toBe("outer");
    expect(outer.optional).toBe(true);
  });

  it("prefers the outermost entry when both wrapper levels carry one", () => {
    expect(
      descriptionOf(
        walkOne(z.number().describe("inner").optional().describe("outer")),
      ),
    ).toBe("outer");
  });

  it("last .describe()/.meta() call on one schema wins (one store)", () => {
    expect(
      descriptionOf(walkOne(z.string().describe("d").meta({ description: "m" }))),
    ).toBe("m");
    expect(
      descriptionOf(walkOne(z.string().meta({ description: "m" }).describe("d"))),
    ).toBe("d");
  });

  it("treats an empty or whitespace-only description as absent", () => {
    expect(descriptionOf(walkOne(z.string().describe("")))).toBeUndefined();
    expect(descriptionOf(walkOne(z.string().describe("   ")))).toBeUndefined();
  });

  it("captures at every position the fixture exercises", () => {
    const ir = fromZod(describedSchema);
    expect(descriptionOf(fieldSpec(ir, "grossWeight"))).toBe("1,000 lbs");
    expect(descriptionOf(fieldSpec(ir, "isCargo"))).toBe(
      "checked for freight ops",
    );
    expect(descriptionOf(fieldSpec(ir, "category"))).toBe("aircraft class");
    expect(descriptionOf(fieldSpec(ir, "firstFlight"))).toBe(
      "maiden flight date",
    );
    expect(descriptionOf(fieldSpec(ir, "registration"))).toBe("tail number");
    expect(descriptionOf(fieldSpec(ir, "fuelCapacity"))).toBe("gallons usable");
    // Nested object field.
    expect(descriptionOf(fieldSpec(fieldSpec(ir, "limits"), "ceiling"))).toBe(
      "feet MSL",
    );
    // Array-row field.
    const legs = fieldSpec(ir, "legs");
    if (legs.kind !== "array") throw new Error("expected array");
    expect(descriptionOf(fieldSpec(legs.item, "distance"))).toBe(
      "nautical miles",
    );
    // Tuple elements.
    const coord = fieldSpec(ir, "coord");
    if (coord.kind !== "tuple") throw new Error("expected tuple");
    expect(coord.elements.map(descriptionOf)).toEqual(["latitude", "longitude"]);
    // Union variant field.
    const payment = fieldSpec(ir, "payment");
    if (payment.kind !== "union") throw new Error("expected union");
    const card = payment.variants.find((v) => v.tag === "card");
    const last4 = card?.fields.find((f) => f.name === "last4");
    expect(descriptionOf(last4?.spec as FieldSpec)).toBe("last four digits");
  });
});

describe("fromType JSDoc description capture", () => {
  it("captures the member's leading JSDoc description, @tags excluded", () => {
    const { ir } = fromType(
      path.join(fixturesDir, "describedType.ts"),
      "DescribedAircraft",
    );
    expect(descriptionOf(fieldSpec(ir, "grossWeight"))).toBe("1,000 lbs");
    expect(descriptionOf(fieldSpec(ir, "origin"))).toBe(
      "ICAO code — four capital letters.",
    );
    expect(descriptionOf(fieldSpec(ir, "undocumented"))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Generated zod schema (type mode) round-trips descriptions
// ---------------------------------------------------------------------------

describe("emitZodSchema descriptions", () => {
  it("emits .describe() outermost, after the wrappers", () => {
    const source = emitZodSchema(fromZod(describedSchema), "described");
    expect(source).toContain('grossWeight: z.number().describe("1,000 lbs"),');
    expect(source).toContain(
      'firstFlight: z.date().optional().describe("maiden flight date"),',
    );
    expect(source).toContain(
      'registration: z.string().optional().describe("tail number"),',
    );
    // .meta({ description }) normalizes to the same .describe spelling.
    expect(source).toContain(
      'fuelCapacity: z.number().describe("gallons usable"),',
    );
  });

  it("round-trips: the emitted source walks back to the same IR", async () => {
    const ir = fromZod(describedSchema);
    const dir = freshTmpDir("descriptions-roundtrip");
    const file = path.join(dir, "described.ts");
    fs.writeFileSync(file, emitZodSchema(ir, "described"), "utf8");
    const jiti = createJiti(import.meta.url);
    const mod = (await jiti.import(pathToFileURL(file).href)) as Readonly<
      Record<string, unknown>
    >;
    expect(fromZod(mod["described"])).toEqual(ir);
  });
});

// ---------------------------------------------------------------------------
// Single-file emission per kit
// ---------------------------------------------------------------------------

type Emitter = (options: EmitFormOptions) => string;

const emitters: readonly (readonly [string, Emitter])[] = [
  ["plain", emitPlainForm],
  ["mui", emitMuiForm],
  ["shadcn", emitShadcnForm],
  ["chakra", emitChakraForm],
  ["mantine", emitMantineForm],
  ["antd", emitAntdForm],
];

const emitDescribed = (emit: Emitter): string =>
  emit({
    ir: fromZod(describedSchema),
    formName: "DescribedForm",
    schemaImport: {
      name: "describedSchema",
      from: "./describedSchema",
      kind: "named",
    },
  });

describe("single-file description emission", () => {
  it("description-free schemas stay clean in every backend", () => {
    emitters.forEach(([, emit]) => {
      const code = emit({
        ir: fromZod(profileSchema),
        formName: "ProfileForm",
        schemaImport: {
          name: "profileSchema",
          from: "./profileSchema",
          kind: "named",
        },
      });
      expect(code).not.toContain("description");
      expect(code).not.toContain("zf-help");
    });
  });

  it("plain renders an always-visible muted helper line (separate slot)", () => {
    const code = emitDescribed(emitPlainForm);
    expect(code).toContain('<p className="zf-help">{"1,000 lbs"}</p>');
    // Booleans included: the line sits under the CheckboxField.
    expect(code).toContain(
      '<CheckboxField form={form} path={"isCargo"} label={"Is Cargo"} />',
    );
    expect(code).toContain('<p className="zf-help">{"checked for freight ops"}</p>');
    // Union variant field: the literal inside the zf-field block.
    expect(code).toContain('<p className="zf-help">{"last four digits"}</p>');
  });

  it("mui routes the description into the shared helperText slot, error first", () => {
    const code = emitDescribed(emitMuiForm);
    // BoundFieldProps gains the optional prop, leaves pass the literal.
    expect(code).toContain("  description?: string;");
    expect(code).toContain(
      '<BoundNumberField form={form} path={"grossWeight"} label={"Gross Weight"} description={"1,000 lbs"} />',
    );
    // THE SWAP: the error keeps MUI's one slot while present.
    expect(code).toContain("helperText={fieldError(field) ?? description}");
    // Union variant field inlines its literal with the same swap.
    expect(code).toContain(
      'helperText={fieldError(paymentLast4) ?? "last four digits"}',
    );
    // Booleans have no slot on FormControlLabel/Switch: no description prop.
    expect(code).toContain(
      '<BoundSwitchField form={form} path={"isCargo"} label={"Is Cargo"} />',
    );
  });

  it("shadcn renders the muted <p> only when no error holds the slot", () => {
    const code = emitDescribed(emitShadcnForm);
    expect(code).toContain(
      "{fieldError(field) === undefined && description !== undefined ? (",
    );
    expect(code).toContain(
      '<p className="text-sm text-muted-foreground">{description}</p>',
    );
    // The checkbox row has room for the line: booleans included.
    expect(code).toContain(
      '<BoundCheckboxField form={form} path={"isCargo"} label={"Is Cargo"} description={"checked for freight ops"} />',
    );
    // Union variant field: inline literal, same swap.
    expect(code).toContain("{fieldError(paymentLast4) === undefined ? (");
    expect(code).toContain(
      '<p className="text-sm text-muted-foreground">{"last four digits"}</p>',
    );
  });

  it("chakra renders Field.HelperText only when Field.ErrorText is empty", () => {
    const code = emitDescribed(emitChakraForm);
    expect(code).toContain(
      "{fieldError(field) === undefined && description !== undefined ? (",
    );
    expect(code).toContain("<Field.HelperText>{description}</Field.HelperText>");
    // Union variant field: inline literal.
    expect(code).toContain(
      "<Field.HelperText>{\"last four digits\"}</Field.HelperText>",
    );
    // Switch.Root has no Field wrapper: booleans skipped.
    expect(code).toContain(
      '<BoundSwitchField form={form} path={"isCargo"} label={"Is Cargo"} />',
    );
  });

  it("mantine fills the native description slot (coexists with error)", () => {
    const code = emitDescribed(emitMantineForm);
    expect(code).toContain(
      "<TextInput label={label} description={description} {...mantineTextInputProps(field)} />",
    );
    // Booleans included: Mantine's Switch has the prop natively.
    expect(code).toContain(
      "<Switch label={label} description={description} {...mantineSwitchProps(field)} />",
    );
    expect(code).toContain(
      '<BoundSwitchField form={form} path={"isCargo"} label={"Is Cargo"} description={"checked for freight ops"} />',
    );
    // Union variant field: inline literal.
    expect(code).toContain(
      '<TextInput label={"Last4"} description={"last four digits"} {...mantineTextInputProps(paymentLast4)} />',
    );
  });

  it("antd renders the muted Typography.Text line only when no error", () => {
    const code = emitDescribed(emitAntdForm);
    expect(code).toContain(
      "{fieldError(field) === undefined && description !== undefined ? (",
    );
    expect(code).toContain(
      '<Typography.Text type="secondary">{description}</Typography.Text>',
    );
    // Union variant field: inline literal.
    expect(code).toContain("{fieldError(paymentLast4) === undefined ? (");
    expect(code).toContain(
      '<Typography.Text type="secondary">{"last four digits"}</Typography.Text>',
    );
    // The bare Checkbox has no slot: booleans skipped.
    expect(code).toContain(
      '<BoundCheckboxField form={form} path={"isCargo"} label={"Is Cargo"} />',
    );
  });
});

// ---------------------------------------------------------------------------
// Module layout, per kit — emission pins plus a real typecheck per kit
// ---------------------------------------------------------------------------

const writeModule = (
  ui: ModuleUi,
): Readonly<{ files: readonly string[]; joined: string }> => {
  const dir = freshTmpDir(`descriptions-module-${ui}`);
  // schema.ts re-exports the fixture; the relative specifier must resolve
  // from the tmp dir.
  const rel = path
    .relative(dir, path.join(fixturesDir, "describedSchema"))
    .split(path.sep)
    .join("/");
  const files = emitModuleForm({
    ir: fromZod(describedSchema),
    formName: "DescribedForm",
    ui,
    schemaImport: { name: "describedSchema", from: rel, kind: "named" },
  });
  const written = files.map((file) => {
    const abs = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content, "utf8");
    return abs;
  });
  return {
    files: written,
    joined: files.map((f) => `// --- file: ${f.path}\n${f.content}`).join("\n"),
  };
};

describe("module-layout description emission", () => {
  it("mui module: helperText swap inline, fieldError imported at the leaf", () => {
    const { files, joined } = writeModule("mui");
    expect(joined).toContain('helperText={fieldError(field) ?? "1,000 lbs"}');
    expect(joined).toContain(
      'import { useMuiNumberFieldProps, fieldError } from "../adapter";',
    );
    // Array-row leaf inside the section file gets the same slot.
    expect(joined).toContain(
      'helperText={fieldError(distance) ?? "nautical miles"}',
    );
    expect(typecheckDiagnostics(files, muiStubPaths)).toEqual([]);
  });

  it("chakra module: guarded Field.HelperText", () => {
    const { files, joined } = writeModule("chakra");
    expect(joined).toContain("{fieldError(field) === undefined ? (");
    expect(joined).toContain(
      '<Field.HelperText>{"1,000 lbs"}</Field.HelperText>',
    );
    expect(typecheckDiagnostics(files, chakraStubPaths)).toEqual([]);
  });

  it("mantine module: native description attribute (Switch included)", () => {
    const { files, joined } = writeModule("mantine");
    expect(joined).toContain(' description={"1,000 lbs"} ');
    expect(joined).toContain(
      '<Switch label={label} description={"checked for freight ops"} {...mantineSwitchProps(field)} />',
    );
    expect(typecheckDiagnostics(files, mantineStubPaths)).toEqual([]);
  });

  it("antd module: guarded Typography.Text line, imports added", () => {
    const { files, joined } = writeModule("antd");
    expect(joined).toContain(
      '<Typography.Text type="secondary">{"1,000 lbs"}</Typography.Text>',
    );
    expect(joined).toContain("{fieldError(field) === undefined ? (");
    // The described leaf pulls Typography and fieldError into its file.
    expect(joined).toMatch(/import \{[^}]*Typography[^}]*\} from "antd";/);
    // The bare Checkbox leaf stays slot-free.
    expect(joined).not.toContain(
      '<Typography.Text type="secondary">{"checked for freight ops"}</Typography.Text>',
    );
    expect(typecheckDiagnostics(files, antdStubPaths)).toEqual([]);
  });

  it("shadcn module: guarded muted <p>, fieldError imported", () => {
    const { files, joined } = writeModule("shadcn");
    expect(joined).toContain(
      '<p className="text-sm text-muted-foreground">{"1,000 lbs"}</p>',
    );
    expect(joined).toContain("{fieldError(field) === undefined ? (");
    expect(typecheckDiagnostics([...files, shadcnStubFile])).toEqual([]);
  });

  it("plain module: always-visible zf-help line", () => {
    const { files, joined } = writeModule("plain");
    expect(joined).toContain('<p className="zf-help">{"1,000 lbs"}</p>');
    expect(typecheckDiagnostics(files)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Custom templates
// ---------------------------------------------------------------------------

describe("template description passthrough", () => {
  const emitWithTemplate = (schema: unknown): string =>
    emitTemplateForm(
      defineTemplate({
        name: "desc-probe",
        leaf: {
          number: ({ label, bind, description }) =>
            `<NumberProbe label={${label}} help={${description === "" ? "undefined" : description}} {...${bind}} />`,
        },
      }),
      {
        ir: fromZod(schema),
        formName: "TemplateForm",
        schemaImport: { name: "s", from: "./s", kind: "named" },
      },
    );

  it("hands the description to leaf renderers as an expression", () => {
    const code = emitWithTemplate(describedSchema);
    // Wrapper path: the prop reference.
    expect(code).toContain("<NumberProbe label={label} help={description}");
    // The wrapper signature carries the prop.
    expect(code).toContain("  description?: string;");
  });

  it("passes the empty string when the schema has no descriptions", () => {
    const code = emitWithTemplate(profileSchema);
    // The renderer saw ctx.description === "" and emitted its fallback.
    expect(code).toContain("<NumberProbe label={label} help={undefined}");
    expect(code).not.toContain("description?: string;");
  });

  it("the plain fallback renders a guarded zf-help line for unlisted kinds", () => {
    const code = emitTemplateForm(
      defineTemplate({ name: "empty", leaf: {} }),
      {
        ir: fromZod(describedSchema),
        formName: "TemplateForm",
        schemaImport: { name: "s", from: "./s", kind: "named" },
      },
    );
    expect(code).toContain("{description !== undefined ? (");
    expect(code).toContain('<p className="zf-help">{description}</p>');
    // Union variant field: the quoted literal flows in instead.
    expect(code).toContain('{"last four digits" !== undefined ? (');
  });
});
