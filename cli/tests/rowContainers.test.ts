import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitModuleForm } from "../src/moduleLayout";
import { emitPlainForm, emitZodSchema } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { freshTmpDir, typecheckDiagnostics } from "./helpers";

// Containers inside array rows (2026-09): a union or tuple as a row-object
// FIELD, a tuple or array as the row ITEM, and the same shapes under nested
// arrays all generate now instead of degrading to TODOs. The single-file
// layout extracts child components where hooks are needed (hooks cannot run
// inside rows.map, leaves bind through components, unions through an
// extracted component per site); the module layout binds in the Row
// component itself, which is already a component. Containers INSIDE a
// union variant bind too, as dotted variant sub-paths ("billing.zip",
// formstand 0.20), and an ARRAY inside a variant extracts a Rows pair on
// useVariantFieldArray (formstand 0.25); only a union inside a variant
// still degrades.
// Typechecking of both layouts' output against the real library is pinned
// by typecheck.test.ts (rowContainersSchema fixture) and the module
// typecheck below; these tests pin the emitted SHAPES.

const matrixSchema = z.object({
  points: z.array(z.tuple([z.number(), z.number()])),
  grid: z.array(z.array(z.number())),
  invoices: z.array(
    z.object({
      ref: z.string(),
      pay: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("card"),
          cardNumber: z.string(),
          // A container inside a variant: dotted sub-path bindings
          // (formstand 0.20).
          billing: z.object({ zip: z.string(), plus4: z.number() }),
          // An ARRAY inside a variant, under a row union: a Rows pair on
          // the variant-array hook (formstand 0.25), the last TODO class
          // the generator carried.
          receipts: z.array(z.object({ url: z.string(), amount: z.number() })),
        }),
        z.object({ kind: z.literal("paypal"), email: z.string() }),
      ]),
    }),
  ),
  // A static union whose variant holds an array: the Rows pair takes no
  // index props.
  shipping: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("pickup"), store: z.string() }),
    z.object({
      mode: z.literal("courier"),
      stops: z.array(z.object({ address: z.string() })),
    }),
  ]),
  segments: z.array(
    z.object({ name: z.string(), span: z.tuple([z.number(), z.number()]) }),
  ),
  teams: z.array(
    z.object({
      title: z.string(),
      methods: z.array(
        z.discriminatedUnion("mode", [
          // A variant array of scalars under a union ROW ITEM: the row's
          // own index must be renamed for the extracted Rows component.
          z.object({ mode: z.literal("a"), x: z.string(), extras: z.array(z.string()) }),
          z.object({ mode: z.literal("b"), y: z.number() }),
        ]),
      ),
      marks: z.array(z.tuple([z.string(), z.number()])),
    }),
  ),
});

const emitPlain = (schema: unknown, formName: string): string =>
  emitPlainForm({
    ir: fromZod(schema),
    formName,
    schemaImport: { name: "s", from: "./s", kind: "named" },
  });

describe("row containers, single-file layout", () => {
  const code = emitPlain(matrixSchema, "MatrixForm");

  it("a tuple row item binds its positions inline at row-indexed paths", () => {
    expect(code).toContain("path={`points.${index}.0`}");
    expect(code).toContain("path={`points.${index}.1`}");
    expect(code).not.toContain('tuple array-item in "points"');
  });

  it("an array-of-arrays row item extracts an inner Rows component", () => {
    expect(code).toContain("const Grid2Rows = ({");
    expect(code).toContain("useFieldArray(form, `grid.${p0}`)");
    expect(code).toContain("<Grid2Rows form={form} p0={index} />");
    expect(code).not.toContain('array array-item in "grid"');
  });

  it("a union row-object field extracts a component on the holed path", () => {
    expect(code).toContain("const InvoicesPayUnion = ({");
    expect(code).toContain(
      "useVariantField(form, `invoices.${p0}.pay`, \"cardNumber\")",
    );
    expect(code).toContain("useField(form, `invoices.${p0}.pay.kind`)");
    expect(code).toContain("<InvoicesPayUnion form={form} p0={index} />");
  });

  it("a container inside a variant binds its leaves as dotted sub-paths", () => {
    expect(code).toContain(
      "useVariantField(form, `invoices.${p0}.pay`, \"billing.zip\")",
    );
    expect(code).toContain(
      "useVariantField(form, `invoices.${p0}.pay`, \"billing.plus4\")",
    );
    expect(code).not.toContain("inside a union variant");
  });

  it("an array inside a row union's variant extracts a Rows pair on the variant-array hook", () => {
    expect(code).toContain("const InvoicesPayReceiptsRows = ({");
    expect(code).toContain(
      "useVariantFieldArray(form, `invoices.${p0}.pay`, `receipts`)",
    );
    // The empty item is typed from the hook, the only name the variant's
    // item type has inside the file, and declared inside the component.
    expect(code).toContain("Parameters<typeof invoicesPayReceiptsArray.push>[0]");
    expect(code).toContain("<InvoicesPayReceiptsRows form={form} p0={p0} />");
    // The rows are a Row component of their own (the Bound components type
    // `path` against FieldPath, which cannot offer a variant path), and its
    // leaves bind with the variant hook on the row template.
    expect(code).toContain("const InvoicesPayReceiptsRow = ({");
    expect(code).toContain(
      "useVariantField(form, `invoices.${p0}.pay`, `receipts.${index}.url`)",
    );
    expect(code).toContain("<InvoicesPayReceiptsRow form={form} p0={p0} index={index} />");
    expect(code).toContain("useVariantFieldArray,");
    expect(code).not.toContain("inside a union variant");
  });

  it("an array inside a static union's variant extracts a Rows pair with no index props", () => {
    expect(code).toContain("const ShippingStopsRows = ({");
    expect(code).toContain("useVariantFieldArray(form, `shipping`, `stops`)");
    expect(code).toContain("<ShippingStopsRows form={form} />");
    expect(code).toContain("useVariantField(form, `shipping`, `stops.${index}.address`)");
  });

  it("a variant array under a union ROW ITEM renames the row's index to the next hole", () => {
    // The union row component takes `index` as a prop and the Rows
    // component maps its own, so the enclosing one becomes p1.
    expect(code).toContain(
      "useVariantFieldArray(form, `teams.${p0}.methods.${p1}`, `extras`)",
    );
    expect(code).toContain("<TeamsMethodsExtrasRows form={form} p0={p0} p1={index} />");
    expect(code).toContain(
      "useVariantField(form, `teams.${p0}.methods.${p1}`, `extras.${index}`)",
    );
  });

  it("a union inside a variant still degrades, and its TODO names the holed path", () => {
    // The one container shape left: a union's discriminant needs a typed
    // useField the variant path cannot offer. The extracted union component
    // names itself from the hole-stripped segments; the TODO used to print
    // that stripped path ("pavements.sub"), which names no field a reader
    // can find. It prints the holed template, as the module layout does.
    const schema = z.object({
      pavements: z.array(
        z.discriminatedUnion("kind", [
          z.object({
            kind: z.literal("asphalt"),
            sub: z.discriminatedUnion("t", [
              z.object({ t: z.literal("x"), a: z.string() }),
              z.object({ t: z.literal("y"), b: z.string() }),
            ]),
          }),
          z.object({ kind: z.literal("grass"), length: z.number() }),
        ]),
      ),
    });
    const out = emitPlain(schema, "PavementsForm");
    expect(out).toContain('nested union "pavements.${index}.sub" inside a union variant');
    expect(out).not.toContain('"pavements.sub"');
  });

  it("an array every variant shares stays a TODO naming the plain array hook", () => {
    const schema = z.object({
      top: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("a"), tags: z.array(z.string()) }),
        z.object({ kind: z.literal("b"), tags: z.array(z.string()) }),
      ]),
    });
    const out = emitPlain(schema, "TopForm");
    expect(out).toContain('array "top.tags" is a key every variant shares');
    expect(out).not.toContain("useVariantFieldArray");
  });

  it("a tuple row-object field binds inline on the row path", () => {
    expect(code).toContain("path={`segments.${index}.span.0`}");
    expect(code).toContain("path={`segments.${index}.span.1`}");
  });

  it("a union row item under a nested array extracts with both holes", () => {
    expect(code).toContain("const TeamsMethodsRow = ({");
    expect(code).toContain(
      "useVariantField(form, `teams.${p0}.methods.${index}`, \"x\")",
    );
    expect(code).toContain(
      "<TeamsMethodsRow form={form} p0={p0} index={index} />",
    );
  });

  it("a tuple row item under a nested array binds inline with the hole", () => {
    expect(code).toContain("path={`teams.${p0}.marks.${index}.0`}");
    expect(code).toContain("path={`teams.${p0}.marks.${index}.1`}");
  });

  it("an optional union row field gets the clearable select wrapper", () => {
    const clearable = emitPlain(
      z.object({
        rows: z.array(
          z.object({
            pay: z
              .discriminatedUnion("kind", [
                z.object({ kind: z.literal("a"), x: z.string() }),
                z.object({ kind: z.literal("b"), y: z.string() }),
              ])
              .optional(),
          }),
        ),
      }),
      "ClearForm",
    );
    expect(clearable).toContain("const RowsPayUnion = ({");
    expect(clearable).toContain("useField(form, `rows.${p0}.pay`)");
    expect(clearable).toContain("? undefined");
  });

  it("deeper array-of-arrays recurse with one hole per level", () => {
    const deep = emitPlain(
      z.object({ cube: z.array(z.array(z.array(z.number()))) }),
      "CubeForm",
    );
    expect(deep).toContain("useFieldArray(form, `cube.${p0}`)");
    expect(deep).toContain("useFieldArray(form, `cube.${p0}.${p1}`)");
    expect(deep).toContain("path={`cube.${p0}.${p1}.${index}`}");
  });
});

describe("row containers, module layout", () => {
  const ir = fromZod(matrixSchema);
  const files = emitModuleForm({
    ir,
    formName: "MatrixForm",
    schemaImport: { name: "matrixSchema", from: "./external", kind: "named" },
    schemaSource: emitZodSchema(ir, "matrixSchema"),
  });
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const section = (name: string): string => {
    const content = byPath.get(`sections/${name}.tsx`);
    if (content === undefined) throw new Error(`missing section ${name}`);
    return content;
  };

  it("a tuple row item binds its positions in the Row component", () => {
    const points = section("PointsSection");
    expect(points).toContain("useMatrixField(`points.${index}.0`)");
    expect(points).toContain("useMatrixField(`points.${index}.1`)");
    expect(points).not.toContain("bind its positions by hand");
  });

  it("a union row-object field binds in the Row with the variant hook", () => {
    const invoices = section("InvoicesSection");
    expect(invoices).toContain(
      "useMatrixField(`invoices.${index}.pay.kind`)",
    );
    expect(invoices).toContain(
      "useMatrixVariantField(`invoices.${index}.pay`, \"cardNumber\")",
    );
    expect(invoices).toContain("useMatrixVariantField,");
  });

  it("a tuple row-object field binds positions in the Row", () => {
    const segments = section("SegmentsSection");
    expect(segments).toContain("useMatrixField(`segments.${index}.span.0`)");
    expect(segments).toContain("useMatrixField(`segments.${index}.span.1`)");
  });

  it("union and tuple items under nested arrays bind in their nested Row", () => {
    const teams = section("TeamsSection");
    expect(teams).toContain(
      "useMatrixVariantField(`teams.${p0}.methods.${index}`, \"x\")",
    );
    expect(teams).toContain("useMatrixField(`teams.${p0}.marks.${index}.0`)");
    expect(teams).not.toContain("bind it by hand");
  });

  it("an array inside a row union's variant extracts a Rows pair in the section file", () => {
    const invoices = section("InvoicesSection");
    expect(invoices).toContain("const InvoicesPayReceiptsRows = ({");
    expect(invoices).toContain(
      "useMatrixVariantFieldArray(`invoices.${p0}.pay`, `receipts`)",
    );
    // Row leaves are variant paths too: the variant hook on a row template.
    expect(invoices).toContain(
      "useMatrixVariantField(`invoices.${p0}.pay`, `receipts.${index}.url`)",
    );
    expect(invoices).toContain("Parameters<typeof rows.push>[0]");
    expect(invoices).toContain("<InvoicesPayReceiptsRows p0={index} />");
    expect(invoices).toContain("useMatrixVariantFieldArray,");
    expect(invoices).not.toContain("inside a union variant");
  });

  it("an array inside a static union section's variant extracts a Rows pair", () => {
    const shipping = section("ShippingSection");
    expect(shipping).toContain("const ShippingStopsRows = () => {");
    expect(shipping).toContain("useMatrixVariantFieldArray(`shipping`, `stops`)");
    expect(shipping).toContain(
      "useMatrixVariantField(`shipping`, `stops.${index}.address`)",
    );
    expect(shipping).toContain("<ShippingStopsRows />");
  });

  it("a variant array under a union ROW ITEM renames the row's index to the next hole", () => {
    const teams = section("TeamsSection");
    expect(teams).toContain(
      "useMatrixVariantFieldArray(`teams.${p0}.methods.${p1}`, `extras`)",
    );
    expect(teams).toContain("<TeamsMethodsExtrasRows p0={p0} p1={index} />");
    expect(teams).toContain(
      "useMatrixVariantField(`teams.${p0}.methods.${p1}`, `extras.${index}`)",
    );
  });

  it("the hooks file exports the variant-array hook", () => {
    const hooks = byPath.get("hooks.ts") ?? "";
    expect(hooks).toContain("useMatrixVariantFieldArray,");
  });

  // The real correctness check: every holed template path the sections bind
  // resolves through the library's FieldPath/UnionValueAt machinery.
  it("the emitted plain module typechecks against the library", () => {
    const dir = freshTmpDir("row-containers-module");
    const written = files.map((file) => {
      const dest = path.join(dir, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content, "utf8");
      return dest;
    });
    expect(typecheckDiagnostics(written)).toEqual([]);
  });
});
