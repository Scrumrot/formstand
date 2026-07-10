import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitZodSchema } from "../src/codegen";
import { emitModuleForm } from "../src/moduleLayout";
import { fromZod } from "../src/fromZod";
import { freshTmpDir, muiStubPaths, typecheckDiagnostics } from "./helpers";

// Nested-array row extraction in the module layout: one Row/Rows component
// pair per array one level below a section root (inside an object section,
// or inside a top-level array's row items), TODO comments beyond that.

// Every extractable shape at once: (a) an array inside an object section,
// (b) an array of objects inside an array row, (c) an array of scalars
// inside an array row, and (d) arrays two levels down (kept as TODOs), plus
// an object inside an array row (also kept as a TODO).
const customerSchema = z.object({
  shipping: z.object({
    contactName: z.string(),
    addresses: z.array(
      z.object({
        city: z.string(),
        zip: z.string().optional(),
        tags: z.array(z.string()), // depth 2 → TODO
      }),
    ),
  }),
  contacts: z.array(
    z.object({
      email: z.string(),
      home: z.object({ street: z.string() }), // object in a row → TODO
      phones: z.array(
        z.object({
          number: z.string(),
          label: z.enum(["home", "work"]),
        }),
      ),
      nicknames: z.array(z.string()),
      meetings: z.array(
        z.object({
          when: z.string(),
          slots: z.array(z.string()), // depth 2 → TODO
        }),
      ),
    }),
  ),
});

// The bound Field/FieldArray hooks must be exported even when the ONLY
// array sits below an object section (no top-level array section at all).
const nestedOnlySchema = z.object({
  shipping: z.object({
    addresses: z.array(z.object({ city: z.string() })),
  }),
});

// Emit a module in type mode (generated schema source — no fixture file on
// disk needed), write every file preserving the folder structure, and
// return the files + written paths.
const generateModule = (
  schema: unknown,
  schemaName: string,
  formName: string,
  dir: string,
  ui: "plain" | "mui" | "shadcn" = "plain",
) => {
  const ir = fromZod(schema);
  const files = emitModuleForm({
    ir,
    formName,
    ui,
    schemaImport: { name: schemaName, from: "./external", kind: "named" },
    schemaSource: emitZodSchema(ir, schemaName),
  });
  const written = files.map((file) => {
    const dest = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    return dest;
  });
  return { files, written };
};

describe("nested arrays in the module layout", () => {
  const dir = freshTmpDir("nested-arrays-plain");
  const { files, written } = generateModule(
    customerSchema,
    "customerSchema",
    "CustomerForm",
    dir,
  );
  const shipping = files.find((f) => f.path === "sections/ShippingSection.tsx");
  const contacts = files.find((f) => f.path === "sections/ContactsSection.tsx");

  it("extracts a Rows/Row pair for an array inside an object section", () => {
    expect(shipping?.content).toContain("const AddressesRow = ({");
    expect(shipping?.content).toContain("const AddressesRows = () => {");
    // Static list path, template row paths.
    expect(shipping?.content).toContain(
      'const rows = useCustomerFieldArray("shipping.addresses");',
    );
    expect(shipping?.content).toContain(
      "const city = useCustomerField(`shipping.addresses.${index}.city`);",
    );
    // Typed empty item: all-blankable fields use the checked annotation.
    expect(shipping?.content).toContain(
      'const emptyAddressesItem: NonNullable<NonNullable<CustomerValues["shipping"]>["addresses"]>[number] = {',
    );
    expect(shipping?.content).toContain(
      "() => rows.push(emptyAddressesItem)",
    );
    // The body renders the list at the array's site — no TODO left.
    expect(shipping?.content).toContain("<AddressesRows />");
    expect(shipping?.content).not.toContain(
      'TODO: nested array "shipping.addresses" —',
    );
  });

  it("extracts a parent-indexed pair for an array of objects inside an array row", () => {
    expect(contacts?.content).toContain("const ContactsPhonesRow = ({");
    expect(contacts?.content).toContain("const ContactsPhonesRows = ({");
    expect(contacts?.content).toContain(
      "}: Readonly<{ parentIndex: number }>) => {",
    );
    expect(contacts?.content).toContain(
      "}: Readonly<{ parentIndex: number; index: number; onRemove: () => void }>) => {",
    );
    // Both numeric holes survive into the bound paths.
    expect(contacts?.content).toContain(
      "const rows = useCustomerFieldArray(`contacts.${parentIndex}.phones`);",
    );
    expect(contacts?.content).toContain(
      "const number = useCustomerField(`contacts.${parentIndex}.phones.${index}.number`);",
    );
    // The main row threads its own index down as parentIndex.
    expect(contacts?.content).toContain(
      "<ContactsPhonesRows parentIndex={index} />",
    );
    expect(contacts?.content).toContain("parentIndex={parentIndex}");
    // Required enum → blank item needs the cast form.
    expect(contacts?.content).toContain(
      '} as unknown as NonNullable<NonNullable<CustomerValues["contacts"]>[number]["phones"]>[number];',
    );
  });

  it("renders single-leaf rows for scalar-item nested arrays", () => {
    expect(contacts?.content).toContain(
      "const field = useCustomerField(`contacts.${parentIndex}.nicknames.${index}`);",
    );
    expect(contacts?.content).toContain(
      'const emptyContactsNicknamesItem: NonNullable<NonNullable<CustomerValues["contacts"]>[number]["nicknames"]>[number] = "";',
    );
    expect(contacts?.content).toContain(
      "<ContactsNicknamesRows parentIndex={index} />",
    );
  });

  it("keeps TODOs for depth-2 arrays and objects inside array rows", () => {
    // One extraction level per array: the array inside an extracted row's
    // item stays a comment, in both section kinds.
    expect(shipping?.content).toContain(
      '{/* TODO: nested array "shipping.addresses.${index}.tags" — one extraction level is generated per array; extract the next level by hand */}',
    );
    expect(contacts?.content).toContain(
      '{/* TODO: nested array "contacts.${parentIndex}.meetings.${index}.slots" — one extraction level is generated per array; extract the next level by hand */}',
    );
    // Objects inside array rows keep their existing TODO.
    expect(contacts?.content).toContain(
      '{/* TODO: nested object "contacts.${index}.home" — extract a row component with its own hook */}',
    );
  });

  it("exports the bound Field/FieldArray hooks when the only array is nested", () => {
    const only = generateModule(
      nestedOnlySchema,
      "nestedOnlySchema",
      "ShipForm",
      freshTmpDir("nested-arrays-only"),
    );
    const hooks = only.files.find((f) => f.path === "hooks.ts");
    expect(hooks?.content).toContain("useShipField,");
    expect(hooks?.content).toContain("useShipFieldArray,");
    const section = only.files.find(
      (f) => f.path === "sections/ShippingSection.tsx",
    );
    expect(section?.content).toContain('import type { ShipValues } from "../types";');
    expect(typecheckDiagnostics(only.written)).toEqual([]);
  });

  // THE BIG ONE: two-hole template paths, typed empty items, and the
  // Row/Rows wiring must typecheck against the real library source.
  it("the emitted plain module typechecks", () => {
    expect(typecheckDiagnostics(written)).toEqual([]);
  });

  it("the emitted mui module typechecks against the MUI stub", () => {
    const mui = generateModule(
      customerSchema,
      "customerSchema",
      "CustomerForm",
      freshTmpDir("nested-arrays-mui"),
      "mui",
    );
    const section = mui.files.find(
      (f) => f.path === "sections/ShippingSection.tsx",
    );
    // The nested list wrapper: Stack + subtitle2 heading, with the imports
    // merged into the section file.
    expect(section?.content).toContain('<Typography variant="subtitle2">');
    expect(section?.content).toContain('} from "@mui/material";');
    expect(typecheckDiagnostics(mui.written, muiStubPaths)).toEqual([]);
  });
});
