import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { type FieldArrayFormApi, useFieldArray } from "../../src/react/useFieldArray";
import { useField } from "../../src/react/useField";
import { useVariantField } from "../../src/react/useVariantField";
import { useVariantFieldArray } from "../../src/react/useVariantFieldArray";
import { useForm } from "../../src/react/useForm";

// An array that lives in ONE variant: asphalt pavements carry `lights`,
// grass ones do not; `tags` is a common key (every variant declares it).
const pavement = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("asphalt"),
    lights: z.array(z.object({ color: z.string() })),
    spec: z.object({ marks: z.array(z.number()) }),
    tags: z.array(z.string()),
  }),
  z.object({ kind: z.literal("grass"), length: z.number(), tags: z.array(z.string()) }),
]);
const schema = z.object({
  top: pavement,
  pavements: z.array(pavement),
});

const initialValues = {
  top: { kind: "asphalt" as const, lights: [], spec: { marks: [] }, tags: [] },
  pavements: [{ kind: "asphalt" as const, lights: [{ color: "red" }], spec: { marks: [] }, tags: [] }],
};

const setup = () =>
  renderHook(() => {
    const form = useForm(schema, { initialValues });
    return {
      form,
      kind: useField(form, "top.kind"),
      lights: useVariantFieldArray(form, "top", "lights"),
      marks: useVariantFieldArray(form, "top", "spec.marks"),
      rowLights: useVariantFieldArray(form, "pavements.0", "lights"),
      firstColor: useVariantField(form, "top", "lights.0.color"),
    };
  });

describe("useVariantFieldArray", () => {
  it("binds the variant's array by the joined path with ordinary array ops", () => {
    const { result } = setup();
    expect(result.current.lights.path).toBe("top.lights");
    expect(result.current.lights.items).toEqual([]);

    act(() => result.current.lights.push({ color: "red" }));
    act(() => result.current.lights.push({ color: "blue" }));
    expect(result.current.lights.items).toEqual([{ color: "red" }, { color: "blue" }]);
    expect(result.current.firstColor.value).toBe("red");

    act(() => result.current.lights.remove(0));
    expect(result.current.lights.items).toEqual([{ color: "blue" }]);
    expect(result.current.form.getState().values.top).toEqual({
      kind: "asphalt",
      lights: [{ color: "blue" }],
      spec: { marks: [] },
      tags: [],
    });
  });

  it("mints stable row ids like useFieldArray", () => {
    const { result } = setup();
    act(() => result.current.lights.push({ color: "a" }));
    act(() => result.current.lights.push({ color: "b" }));
    const [first, second] = result.current.lights.fields.map((row) => row.id);
    act(() => result.current.lights.remove(0));
    expect(result.current.lights.fields.map((row) => row.id)).toEqual([second]);
    expect(first).not.toBe(second);
  });

  it("reaches an array inside a variant-only object and a row-indexed union", () => {
    const { result } = setup();
    expect(result.current.marks.path).toBe("top.spec.marks");
    act(() => result.current.marks.push(3));
    expect(result.current.form.getState().values.top).toMatchObject({
      spec: { marks: [3] },
    });
    expect(result.current.rowLights.path).toBe("pavements.0.lights");
    expect(result.current.rowLights.items).toEqual([{ color: "red" }]);
  });

  it("types the rows from the declaring variants", () => {
    const { result } = setup();
    expectTypeOf(result.current.lights.items).toEqualTypeOf<
      readonly { color: string }[]
    >();
    expectTypeOf(result.current.lights.push).parameter(0).toEqualTypeOf<{
      color: string;
    }>();
    expectTypeOf(result.current.marks.items).toEqualTypeOf<readonly number[]>();
    expectTypeOf(result.current.rowLights.items).toEqualTypeOf<
      readonly { color: string }[]
    >();
    // The row's own leaves are variant paths too, on a row template.
    expectTypeOf(result.current.firstColor.value).toEqualTypeOf<string | undefined>();
  });

  it("rejects common keys, scalars and paths no variant declares", () => {
    const form = createForm(schema, { initialValues });
    renderHook(() => {
      // A common-key array is a plain FieldPath: useFieldArray types it.
      const tags = useFieldArray(form, "top.tags");
      expectTypeOf(tags.items).toEqualTypeOf<readonly string[]>();
      // @ts-expect-error common key: bind with useFieldArray
      useVariantFieldArray(form, "top", "tags");
      // @ts-expect-error a scalar variant field is not an array path
      useVariantFieldArray(form, "top", "length");
      // @ts-expect-error no variant declares it
      useVariantFieldArray(form, "top", "bulbs");
      // @ts-expect-error the typed form rejects an explicit item type argument
      useVariantFieldArray<{ color: string }>(form, "top", "lights");
      return null;
    });
  });

  it("binds structurally on a schema-less FieldArrayFormApi with an explicit item type", () => {
    const form = createForm(schema, { initialValues });
    const structural: FieldArrayFormApi = form;
    const { result } = renderHook(() =>
      useVariantFieldArray<{ color: string }>(structural, "top", "lights"),
    );
    expectTypeOf(result.current.items).toEqualTypeOf<readonly { color: string }[]>();
    act(() => result.current.push({ color: "x" }));
    expect(form.getState().values.top).toMatchObject({ lights: [{ color: "x" }] });
  });
});
