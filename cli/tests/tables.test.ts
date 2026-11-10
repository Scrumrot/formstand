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
} from "../src/codegen";
import { fromZod } from "../src/fromZod";
import type { FieldSpec } from "../src/ir";
import { applyFieldOverrides, parseFieldOverrides } from "../src/overrides";
import { tableColumns, tableRejection } from "../src/tables";

// Arrays of FLAT object rows (every field a scalar within the path budget,
// none overridden) render as tables by default: a Row component per row
// binding each cell from hoisted hooks, the labels in the header, a Remove
// column, the array-level error and the Add button under the table. Rows
// that hold a container keep the cards, and the config's `layout` opts a
// flat array back out ("cards") or asserts a table ("table", loudly).

const schema = z.object({
  title: z.string(),
  crew: z.array(
    z.object({
      name: z.string(),
      age: z.number().describe("Years at the last birthday"),
      role: z.enum(["pilot", "cabin"]),
      lead: z.boolean(),
      joined: z.date().optional(),
    }),
  ),
  // A row holding a nested list: not tabular, and the nested list's own
  // rows are flat, so THAT one is a table inside the card.
  legs: z.array(
    z.object({
      from: z.string(),
      stops: z.array(z.object({ code: z.string() })),
    }),
  ),
  // Scalar rows have no columns.
  tags: z.array(z.string()),
});

type Emitter = (options: EmitFormOptions) => string;

const emit = (
  emitter: Emitter,
  ir: FieldSpec = fromZod(schema),
  extra: Partial<EmitFormOptions> = {},
): string =>
  emitter({
    ir,
    formName: "FlightForm",
    schemaImport: { name: "schema", from: "./schema", kind: "named" },
    ...extra,
  });

const irWith = (
  overrides: Readonly<Record<string, unknown>>,
  source: z.ZodType = schema,
): FieldSpec =>
  applyFieldOverrides(
    fromZod(source),
    parseFieldOverrides(overrides, "cfg"),
    "single",
    1,
  );

const arraySpec = (ir: FieldSpec, name: string): FieldSpec => {
  if (ir.kind !== "object") throw new Error("object root expected");
  const field = ir.fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`no field ${name}`);
  return field.spec;
};

describe("tables: which arrays are tables", () => {
  const ir = fromZod(schema);

  it("flat object rows are columns in field order", () => {
    const crew = arraySpec(ir, "crew");
    if (crew.kind !== "array") throw new Error("array expected");
    expect(tableColumns(crew.item, 2, 9)?.map((c) => c.name)).toEqual([
      "name",
      "age",
      "role",
      "lead",
      "joined",
    ]);
  });

  it("rows holding a container, scalar rows, and an opt-out are cards", () => {
    const legs = arraySpec(ir, "legs");
    const tags = arraySpec(ir, "tags");
    const crew = arraySpec(ir, "crew");
    if (legs.kind !== "array" || tags.kind !== "array" || crew.kind !== "array") {
      throw new Error("arrays expected");
    }
    expect(tableColumns(legs.item, 2, 9)).toBeUndefined();
    expect(tableRejection(legs.item, 2, 9)).toBe(
      'row field "stops" is an array; a table cell holds one scalar control',
    );
    expect(tableColumns(tags.item, 2, 9)).toBeUndefined();
    expect(tableRejection(tags.item, 2, 9)).toContain("its rows are not objects");
    expect(tableColumns(crew.item, 2, 9, "cards")).toBeUndefined();
  });

  it("a row past the typed-path budget is not tabular", () => {
    const crew = arraySpec(ir, "crew");
    if (crew.kind !== "array") throw new Error("array expected");
    // The cells bind at rowSegments + 1; a budget of 2 leaves no room.
    expect(tableRejection(crew.item, 2, 2)).toContain(
      "exceeds the typed FieldPath depth (2)",
    );
  });
});

describe("tables: the plain single-file layout", () => {
  const code = emit(emitPlainForm);

  it("renders the flat array as a table with a Row component per row", () => {
    expect(code).toContain("const CrewRow = ({");
    expect(code).toContain(
      "}: Readonly<{ form: Form<typeof schema>; index: number; onRemove: () => void }>) => {",
    );
    expect(code).toContain("const name = useField(form, `crew.${index}.name`);");
    expect(code).toContain("const role = useField(form, `crew.${index}.role`);");
    expect(code).toContain("<table>");
    expect(code).toContain('<th scope="col">{"Name"}</th>');
    expect(code).toContain('<th scope="col">{"Joined"}</th>');
    // The Remove column has an empty header.
    expect(code).toContain('<th scope="col" />');
    expect(code).toContain("{crewArray.fields.map((row, index) => (");
    expect(code).toContain("<CrewRow");
    expect(code).toContain("onRemove={() => crewArray.remove(index)}");
    expect(code).toContain("onClick={() => crewArray.push(emptyCrewItem)}");
    // No card chrome for this array.
    expect(code).not.toContain('<legend>{"Crew #"}{index + 1}</legend>');
  });

  it("cells are the raw controls, named by aria-label, with the error line", () => {
    expect(code).toContain(
      '<input {...textInputProps(name)} aria-label={"Name"} aria-describedby=',
    );
    expect(code).toContain('<input {...numberInputProps(age)} aria-label={"Age"}');
    expect(code).toContain('<select {...selectProps(role)} aria-label={"Role"}');
    expect(code).toContain('<option value={"pilot"}>{"Pilot"}</option>');
    expect(code).toContain('<input {...checkboxProps(lead)} aria-label={"Lead"}');
    expect(code).toContain('<input {...dateInputProps(joined)} aria-label={"Joined"}');
    expect(code).toContain(
      '<p id={`${name.path}-error`} role="alert">{name.error?.[0]}</p>',
    );
    expect(code).toContain('<button type="button" onClick={onRemove}>');
  });

  it("a description rides the header cell's title", () => {
    expect(code).toContain(
      '<th scope="col" title={"Years at the last birthday"}>{"Age"}</th>',
    );
  });

  it("imports the builders and useField for the cells, not the leaf components", () => {
    expect(code).toContain("  useField,");
    ["textInputProps", "numberInputProps", "dateInputProps", "checkboxProps", "selectProps"].forEach(
      (name) => expect(code).toContain(`  ${name},`),
    );
    // The title is a static TextField; the other kinds live only in cells.
    expect(code).toContain("  TextField,");
    ["NumberField", "DateField", "CheckboxField", "SelectField"].forEach((name) =>
      expect(code).not.toContain(`  ${name},`),
    );
  });

  it("rows holding a container keep the cards; their flat nested list is a table", () => {
    expect(code).toContain('<legend>{"Legs #"}{index + 1}</legend>');
    expect(code).toContain("path={`legs.${index}.from`}");
    expect(code).toContain("const LegsStopsRow = ({");
    expect(code).toContain(
      "const code = useField(form, `legs.${p0}.stops.${index}.code`);",
    );
    expect(code).toContain("<LegsStopsRows form={form} p0={index} />");
    // Scalar rows stay cards too.
    expect(code).toContain('<legend>{"Tags #"}{index + 1}</legend>');
  });

  it("layout cards opts a flat array back out", () => {
    const cards = emit(emitPlainForm, irWith({ crew: { layout: "cards" } }));
    expect(cards).not.toContain("const CrewRow = ({");
    expect(cards).toContain('<legend>{"Crew #"}{index + 1}</legend>');
    expect(cards).toContain("path={`crew.${index}.name`}");
    expect(cards).toContain("  NumberField,");
  });

  it("a row field with a component override keeps the cards", () => {
    const cards = emit(
      emitPlainForm,
      irWith({ "crew.*.name": { component: "textarea" } }),
    );
    expect(cards).not.toContain("const CrewRow = ({");
    expect(cards).toContain("<TextareaField form={form} path={`crew.${index}.name`}");
  });
});

describe("tables: config validation", () => {
  it("parses layout and rejects other values", () => {
    expect(parseFieldOverrides({ crew: { layout: "table" } }, "cfg")).toEqual({
      crew: { layout: "table" },
    });
    expect(() =>
      parseFieldOverrides({ crew: { layout: "grid" } }, "cfg"),
    ).toThrow(/layout must be "table" or "cards"/);
    expect(() => parseFieldOverrides({ crew: {} }, "cfg")).toThrow(
      /must set component, span and\/or layout/,
    );
    expect(() => parseFieldOverrides({ crew: { layouts: "table" } }, "cfg")).toThrow(
      /known: component, optionsProp, span, layout/,
    );
  });

  it("layout table on a flat array stamps the array spec", () => {
    const crew = arraySpec(irWith({ crew: { layout: "table" } }), "crew");
    expect(crew.override).toEqual({ layout: "table" });
  });

  it("layout table on rows a table cannot host errors naming the field", () => {
    expect(() => irWith({ legs: { layout: "table" } })).toThrow(
      /fields\["legs"\]: layout "table" cannot apply: row field "stops" is an array; a table cell holds one scalar control/,
    );
    expect(() =>
      irWith({
        crew: { layout: "table" },
        "crew.*.name": { component: "textarea" },
      }),
    ).toThrow(/row field "name" carries a component override \("textarea"\)/);
  });

  it("layout on anything but an array of objects errors", () => {
    expect(() => irWith({ title: { layout: "cards" } })).toThrow(
      /layout applies to arrays of objects, but this field is kind "string"/,
    );
    expect(() => irWith({ tags: { layout: "table" } })).toThrow(
      /this field is an array of string rows/,
    );
  });
});

describe("tables: the kit backends", () => {
  it("mui: dense TextFields named through the native input slot, the number slot merged", () => {
    const code = emit(emitMuiForm);
    expect(code).toContain("  Table,\n  TableBody,\n  TableCell,\n  TableHead,\n  TableRow,");
    expect(code).toContain(
      '<TextField fullWidth size="small" {...muiTextFieldProps(name)} slotProps={{ htmlInput: { "aria-label": "Name" } }} />',
    );
    expect(code).toContain("const ageNumberProps = useMuiNumberFieldProps(age);");
    expect(code).toContain(
      '<TextField fullWidth size="small" {...ageNumberProps} slotProps={{ ...ageNumberProps.slotProps, htmlInput: { "aria-label": "Age" } }} />',
    );
    expect(code).toContain(
      '<Switch {...muiSwitchProps(lead)} slotProps={{ input: { "aria-label": "Lead" } }} />',
    );
    expect(code).toContain('<TableCell title={"Years at the last birthday"}>{"Age"}</TableCell>');
    expect(code).toContain('<Table size="small">');
    expect(code).toContain("<TableRow>\n      <TableCell>");
  });

  it("mui@5 spells the input slot as the legacy inputProps", () => {
    const code = emit(emitMuiForm, fromZod(schema), { muiVersion: 5 });
    expect(code).toContain(
      '<TextField fullWidth size="small" {...muiTextFieldProps(name)} inputProps={{ "aria-label": "Name" }} />',
    );
    expect(code).toContain(
      '<TextField fullWidth size="small" {...ageNumberProps} inputProps={{ "aria-label": "Age" }} />',
    );
    expect(code).toContain(
      '<Switch {...muiSwitchProps(lead)} inputProps={{ "aria-label": "Lead" }} />',
    );
  });

  it("mui: at two columns the table rides one spanning Grid cell", () => {
    const code = emit(emitMuiForm, fromZod(schema), {
      visual: { sections: "flat", columns: 2 },
    });
    expect(code).toContain('<Grid size={12}>\n        <Table size="small">');
  });

  it("shadcn: the table primitives, Inputs named by aria-label, FieldError per cell", () => {
    const code = emit(emitShadcnForm);
    expect(code).toContain(
      'import {\n  Table,\n  TableBody,\n  TableCell,\n  TableHead,\n  TableHeader,\n  TableRow,\n} from "@/components/ui/table";',
    );
    expect(code).toContain(
      '<Input id={name.path} aria-label={"Name"} {...shadcnTextInputProps(name)} />',
    );
    expect(code).toContain("<FieldError field={name} />");
    expect(code).toContain('<TableHead title={"Years at the last birthday"}>{"Age"}</TableHead>');
    expect(code).toContain('<Checkbox id={lead.path} aria-label={"Lead"} {...shadcnCheckboxProps(lead)} />');
    expect(code).toContain('<SelectTrigger id={role.path} aria-label={"Role"} className="w-full"');
  });

  it("chakra: Table.Root with Field-wrapped cells and a named hidden switch input", () => {
    const code = emit(emitChakraForm);
    expect(code).toContain("  Table,\n  Text,");
    expect(code).toContain('<Table.Root size="sm">');
    expect(code).toContain('<Table.ColumnHeader title={"Years at the last birthday"}>{"Age"}</Table.ColumnHeader>');
    expect(code).toContain(
      '<Input aria-label={"Name"} {...chakraTextInputProps(name)} />',
    );
    expect(code).toContain('<Switch.HiddenInput aria-label={"Lead"} />');
    expect(code).toContain("<Field.ErrorText>{fieldError(name)}</Field.ErrorText>");
  });

  it("mantine: Table statics with aria-labelled inputs", () => {
    const code = emit(emitMantineForm);
    expect(code).toContain("  Table,\n  Text,");
    expect(code).toContain('<Table.Th title={"Years at the last birthday"}>{"Age"}</Table.Th>');
    expect(code).toContain('<TextInput aria-label={"Name"} {...mantineTextInputProps(name)} />');
    expect(code).toContain('<TextInput aria-label={"Age"} {...ageNumberProps} />');
    expect(code).toContain('<Switch aria-label={"Lead"} {...mantineSwitchProps(lead)} />');
    expect(code).toContain("<Table.Tr>\n      <Table.Td>");
  });

  it("antd: a data-driven Table over one cell component per column", () => {
    const code = emit(emitAntdForm);
    expect(code).toContain("  Table,\n  Typography,");
    expect(code).toContain("const CrewNameCell = ({");
    expect(code).toContain("const CrewAgeCell = ({");
    expect(code).toContain("const field = useField(form, `crew.${index}.age`);");
    expect(code).toContain("const fieldNumberProps = useAntdNumberInputProps(field);");
    expect(code).toContain('<Input id={field.path} aria-label={"Name"} {...antdTextInputProps(field)} />');
    expect(code).toContain('dataSource={crewArray.fields}');
    expect(code).toContain('rowKey="id"');
    expect(code).toContain("pagination={false}");
    expect(code).toContain('key: "name",\n                title: "Name",');
    expect(code).toContain('title: <span title={"Years at the last birthday"}>{"Age"}</span>,');
    expect(code).toContain("render: (_value, _row, index) => (\n                  <CrewNameCell form={form} index={index} />");
    expect(code).toContain('key: "remove",');
    expect(code).toContain("onClick={() => crewArray.remove(index)}");
    // No Row component in the column style.
    expect(code).not.toContain("const CrewRow = ({");
  });

  it("no table, no table imports", () => {
    const flat = z.object({ name: z.string(), tags: z.array(z.string()) });
    const ir = fromZod(flat);
    expect(emit(emitMuiForm, ir)).not.toContain("  Table,");
    expect(emit(emitShadcnForm, ir)).not.toContain("@/components/ui/table");
    expect(emit(emitChakraForm, ir)).not.toContain("  Table,");
    expect(emit(emitMantineForm, ir)).not.toContain("  Table,");
    expect(emit(emitAntdForm, ir)).not.toContain("  Table,");
  });
});

describe("usage walks under array rows (regressions found with the tables)", () => {
  // Both walks passed `count + 1` as the BUDGET when descending into an
  // array's item, so anything two objects deep under a row sat past a budget
  // of two and was skipped: a union there lost its builder imports, a
  // described leaf there lost the Bound components' description prop.
  const deep = z.object({
    teams: z.array(
      z.object({
        meta: z.object({
          pay: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("card"), last4: z.string() }),
            z.object({ kind: z.literal("cash"), amount: z.number() }),
          ]),
          detail: z.object({ note: z.string().describe("Why it matters") }),
        }),
      }),
    ),
  });

  it("a union under an object inside rows imports its builders", () => {
    const code = emit(emitPlainForm, fromZod(deep));
    expect(code).toContain("  textInputProps,");
    expect(code).toContain("  numberInputProps,");
    expect(code).toContain("  selectProps,");
  });

  it("a described leaf two objects deep inside rows keeps the description prop", () => {
    const code = emit(emitMuiForm, fromZod(deep));
    expect(code).toContain("  description?: string;");
    expect(code).toContain('description={"Why it matters"}');
  });
});
