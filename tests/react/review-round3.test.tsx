// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { Form } from "../../src/core/createForm";
import { createForm } from "../../src/core/createForm";
import { persistForm, type PersistStorage } from "../../src/core/persist";
import {
  CheckboxField,
  DateField,
  NumberField,
  type PathsAccepting,
  SelectField,
  type SelectValueAt,
  TextField,
} from "../../src/react/fields";
import type { FieldFormApi } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";
import { fillFields } from "../../src/testing";

afterEach(cleanup);

// The October review's round-3 decisions: type-level tightening that
// rejects code which was already a runtime bug, plus the persist alias.
// The @ts-expect-error lines are enforced by `tsc --noEmit` over tests/.

const schema = z.object({
  name: z.string(),
  nick: z.string().optional(),
  age: z.number(),
  score: z.number().nullable(),
  agree: z.boolean(),
  born: z.date().optional(),
  plan: z.enum(["free", "pro"]),
  plan2: z.enum(["a", "b"]).nullable(),
  free: z.string(),
  users: z.array(z.object({ email: z.string(), seats: z.number() })),
});

const initialValues = {
  name: "",
  age: 0,
  score: null,
  agree: false,
  plan: "free" as const,
  plan2: null,
  free: "",
  users: [{ email: "a@a.com", seats: 1 }],
};

const Harness = ({ index }: Readonly<{ index: number }>) => {
  const form = useForm(schema, { initialValues });
  return (
    <>
      {/* value-compatible paths, including optional/nullable and rows */}
      <TextField form={form} path="name" label="Name" />
      <TextField form={form} path="nick" label="Nick" />
      <TextField form={form} path={`users.${index}.email`} label="Email" />
      <NumberField form={form} path="age" label="Age" />
      <NumberField form={form} path="score" label="Score" />
      <NumberField form={form} path={`users.${index}.seats`} label="Seats" />
      <CheckboxField form={form} path="agree" label="Agree" />
      <DateField form={form} path="born" label="Born" />
      <SelectField
        form={form}
        path="plan"
        label="Plan"
        options={[
          { value: "free", label: "Free" },
          { value: "pro", label: "Pro" },
        ]}
      />
      <SelectField
        form={form}
        path="plan2"
        label="Plan 2"
        options={[{ value: "a", label: "A" }]}
      />
      {/* a free string path takes any option value */}
      <SelectField
        form={form}
        path="free"
        label="Free text"
        options={[{ value: "anything", label: "Anything" }]}
      />
    </>
  );
};

// Typechecked, never rendered: these bindings are the runtime bugs the
// filter exists to reject, and rendering a DateField over a string would
// throw for real.
export const WrongTypes = () => {
  const form = useForm(schema, { initialValues });
  return (
    <>
      {/* @ts-expect-error a text control cannot hold a number */}
      <TextField form={form} path="age" label="Wrong" />
      {/* @ts-expect-error a number control cannot hold a string */}
      <NumberField form={form} path="name" label="Wrong" />
      {/* @ts-expect-error a checkbox cannot hold a string */}
      <CheckboxField form={form} path="name" label="Wrong" />
      {/* @ts-expect-error a date control cannot hold a string */}
      <DateField form={form} path="name" label="Wrong" />
      {/* @ts-expect-error a text control cannot hold an array */}
      <TextField form={form} path="users" label="Wrong" />
      <SelectField
        form={form}
        path="plan"
        label="Wrong option"
        // @ts-expect-error "bogus" is not one of the enum's values
        options={[{ value: "bogus", label: "Bogus" }]}
      />
    </>
  );
};

// A bare FieldFormApi keeps plain string paths for every component.
const Bare = ({ form }: Readonly<{ form: FieldFormApi }>) => (
  <>
    <TextField form={form} path={["na", "me"].join("")} label="Bare text" />
    <SelectField
      form={form}
      path="plan"
      label="Bare select"
      options={[{ value: "whatever", label: "W" }]}
    />
  </>
);

describe("bound components type their path by value", () => {
  it("renders the value-compatible bindings", () => {
    render(<Harness index={0} />);
    expect(screen.getByLabelText("Name")).toHaveProperty("name", "name");
    expect(screen.getByLabelText("Seats")).toHaveProperty("name", "users.0.seats");
    expect(screen.getByLabelText("Plan 2")).toHaveProperty("name", "plan2");
  });

  it("a bare FieldFormApi keeps string paths", () => {
    const Wrapper = () => <Bare form={useForm(schema, { initialValues })} />;
    render(<Wrapper />);
    expect(screen.getByLabelText("Bare text")).toHaveProperty("name", "name");
  });

  it("PathsAccepting filters by value and SelectValueAt picks the enum", () => {
    type F = Form<typeof schema>;
    expectTypeOf<"age">().toMatchTypeOf<PathsAccepting<F, number | null | undefined>>();
    expectTypeOf<"score">().toMatchTypeOf<PathsAccepting<F, number | null | undefined>>();
    expectTypeOf<"name">().not.toMatchTypeOf<PathsAccepting<F, number | null | undefined>>();
    expectTypeOf<SelectValueAt<F, "plan">>().toEqualTypeOf<"free" | "pro">();
    expectTypeOf<SelectValueAt<F, "plan2">>().toEqualTypeOf<"a" | "b">();
    expectTypeOf<SelectValueAt<F, "free">>().toEqualTypeOf<string>();
    expectTypeOf<PathsAccepting<FieldFormApi, string>>().toEqualTypeOf<string>();
  });
});

describe("fillFields types each value from its key", () => {
  it("writes typed fixtures and rejects a wrong-typed one at compile time", () => {
    const form = createForm(schema, { initialValues });
    fillFields(form, { name: "Ada", age: 3, plan: "pro" });
    expect(form.getState().values.name).toBe("Ada");
    expect(form.getState().values.age).toBe(3);
    const neverRuns = (): void => {
      // @ts-expect-error age is a number
      fillFields(form, { age: "x" });
      // @ts-expect-error unknown key
      fillFields(form, { naem: "x" });
    };
    expect(typeof neverRuns).toBe("function");
  });
});

describe("persistForm apply: \"edit\" and its \"restore\" alias", () => {
  const memory = (seed: Readonly<Record<string, string>>): PersistStorage => {
    const map = new Map(Object.entries(seed));
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
    };
  };
  const small = z.object({ title: z.string() });

  it("\"edit\" loads the draft dirty against the initial values", () => {
    const form = createForm(small, { initialValues: { title: "" } });
    persistForm(form, {
      key: "k",
      apply: "edit",
      storage: memory({ k: JSON.stringify({ title: "draft" }) }),
    });
    expect(form.getState().values.title).toBe("draft");
    expect(form.getFieldState("title").dirty).toBe(true);
  });

  it("\"restore\" still means the same thing", () => {
    const form = createForm(small, { initialValues: { title: "" } });
    persistForm(form, {
      key: "k",
      apply: "restore",
      storage: memory({ k: JSON.stringify({ title: "draft" }) }),
    });
    expect(form.getFieldState("title").dirty).toBe(true);
  });

  it("\"adopt\" (the default) reads clean", () => {
    const form = createForm(small, { initialValues: { title: "" } });
    persistForm(form, {
      key: "k",
      storage: memory({ k: JSON.stringify({ title: "draft" }) }),
    });
    expect(form.getState().values.title).toBe("draft");
    expect(form.getFieldState("title").dirty).toBe(false);
  });
});
