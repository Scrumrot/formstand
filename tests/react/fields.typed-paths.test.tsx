import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { Form } from "../../src/core/createForm";
import type { FieldPath } from "../../src/core/fieldPath";
import {
  CheckboxField,
  NumberField,
  type PathsOf,
  SelectField,
  TextField,
} from "../../src/react/fields";
import type { FieldFormApi } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

const schema = z.object({
  name: z.string(),
  age: z.number(),
  agree: z.boolean(),
  plan: z.enum(["free", "pro"]),
  users: z.array(z.object({ email: z.string() })),
});

const initialValues = {
  name: "",
  age: 0,
  agree: false,
  plan: "free" as const,
  users: [{ email: "a@a.com" }],
};

// Compile-time cases: valid paths and template-literal array paths must
// typecheck against the Form's schema; typos must not; a bare structural
// FieldFormApi keeps plain string paths.
const TypedHarness = ({ index }: Readonly<{ index: number }>) => {
  const form = useForm(schema, { initialValues });
  return (
    <>
      <TextField form={form} path="name" label="Name" />
      <NumberField form={form} path="age" label="Age" />
      <CheckboxField form={form} path="agree" label="Agree" />
      <SelectField
        form={form}
        path="plan"
        label="Plan"
        options={[
          { value: "free", label: "Free" },
          { value: "pro", label: "Pro" },
        ]}
      />
      {/* dynamic array-row path — the template literal stays in the union */}
      <TextField form={form} path={`users.${index}.email`} label="Email" />
      {/* @ts-expect-error - "naem" is not a path of the schema */}
      <TextField form={form} path="naem" label="Typo" />
      {/* @ts-expect-error - typo in a nested array path */}
      <NumberField form={form} path={`users.${index}.emial`} label="Typo" />
      {/* @ts-expect-error - "agre" is not a path of the schema */}
      <CheckboxField form={form} path="agre" label="Typo" />
      {/* @ts-expect-error - "paln" is not a path of the schema */}
      <SelectField form={form} path="paln" label="Typo" options={[]} />
    </>
  );
};

// A schema-less form (bare FieldFormApi) keeps `path: string`, so reusable
// field components can pass runtime-built paths without casts.
const BareRow = ({ form, path }: Readonly<{ form: FieldFormApi; path: string }>) => (
  <TextField form={form} path={path} label="Bare" />
);

describe("bound component typed paths", () => {
  it("renders with schema-typed and template-literal paths", () => {
    render(<TypedHarness index={0} />);
    expect(screen.getByLabelText("Name")).toHaveProperty("name", "name");
    expect(screen.getByLabelText("Email")).toHaveProperty(
      "name",
      "users.0.email",
    );
  });

  it("accepts plain string paths through a bare FieldFormApi", () => {
    const Harness = () => {
      const form = useForm(schema, { initialValues });
      return <BareRow form={form} path={["name"].join("")} />;
    };
    render(<Harness />);
    expect(screen.getByLabelText("Bare")).toHaveProperty("name", "name");
  });

  it("PathsOf narrows to the schema's FieldPath union for a Form", () => {
    expectTypeOf<PathsOf<Form<typeof schema>>>().toEqualTypeOf<
      FieldPath<z.input<typeof schema>>
    >();
    expectTypeOf<PathsOf<FieldFormApi>>().toEqualTypeOf<string>();
  });
});
