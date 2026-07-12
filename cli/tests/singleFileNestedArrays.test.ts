import { describe, expect, it } from "vitest";
import { z } from "zod";
import { emitPlainForm } from "../src/codegen";
import { fromZod } from "../src/fromZod";

// Single-file nested-array extraction: an array inside an array row compiles to
// a child {Stem}Rows component (its own useFieldArray, a typed `form` prop, and
// p0/p1/... index threading) instead of a TODO — mirroring the module layout.
// (Generated output is typechecked against the real library in typecheck.test
// via the nestedArraySchema fixture.)

const emit = (schema: unknown, formName: string): string =>
  emitPlainForm({
    ir: fromZod(schema),
    formName,
    schemaImport: { name: "s", from: "./s", kind: "named" },
  });

describe("single-file nested arrays", () => {
  it("extracts a child Rows component for an array in an array row", () => {
    const code = emit(
      z.object({
        contacts: z.array(
          z.object({
            email: z.string(),
            phones: z.array(z.object({ number: z.string() })),
          }),
        ),
      }),
      "ContactForm",
    );
    // No leftover TODO for the nested array.
    expect(code).not.toContain("inside an array row — extract");
    // A typed child component bound at the parent-indexed path.
    expect(code).toContain("import type { Form } from \"formstand\";");
    expect(code).toContain("const ContactsPhonesRows = ({");
    expect(code).toContain("form: Form<typeof s>");
    expect(code).toContain(
      "const contactsPhonesArray = useFieldArray(form, `contacts.${p0}.phones`);",
    );
    expect(code).toContain(
      "path={`contacts.${p0}.phones.${index}.number`}",
    );
    // The main row threads its own index down as p0.
    expect(code).toContain("<ContactsPhonesRows form={form} p0={index} />");
  });

  it("threads two holes for three levels of nesting", () => {
    const code = emit(
      z.object({
        teams: z.array(
          z.object({
            members: z.array(
              z.object({ phones: z.array(z.string()) }),
            ),
          }),
        ),
      }),
      "OrgForm",
    );
    expect(code).toContain(
      "const teamsMembersPhonesArray = useFieldArray(form, `teams.${p0}.members.${p1}.phones`);",
    );
    // The middle row passes its inherited p0 plus its own index as p1.
    expect(code).toContain("<TeamsMembersPhonesRows form={form} p0={p0} p1={index} />");
  });

  it("extracts a scalar nested array (single control per row)", () => {
    const code = emit(
      z.object({
        contacts: z.array(z.object({ tags: z.array(z.string()) })),
      }),
      "TagForm",
    );
    expect(code).toContain(
      "path={`contacts.${p0}.tags.${index}`}",
    );
    expect(code).toContain("<ContactsTagsRows form={form} p0={index} />");
  });
});
