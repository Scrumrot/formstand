// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { FormstandDevtools } from "../../src/devtools";
import type { FormstandDevtoolsProps } from "../../src/devtools";
import type {
  ArrayFieldPath,
  ArrayItemOf,
  ArrayPathsOf,
  BoundUseFields,
  BoundUseVariantField,
  Form,
  PathsAccepting,
  SelectValueAt,
} from "../../src/index";
import { createFormHooks } from "../../src/react/createFormHooks";
import type { FieldFormApi } from "../../src/react/useField";
import { useField } from "../../src/react/useField";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

// The October 2026 review's round B hook-side findings. The @ts-expect-error
// lines are enforced by `tsc --noEmit` over tests/.

const arraySchema = z.object({
  name: z.string(),
  pair: z.tuple([z.string(), z.number()]),
  tags: z.array(z.string()).optional(),
  nullableTags: z.array(z.string()).nullable(),
  rows: z.array(z.object({ id: z.string(), tags: z.array(z.string()) })),
});

const arrayInitial = {
  name: "",
  pair: ["a", 1] as [string, number],
  nullableTags: null,
  rows: [{ id: "r0", tags: ["t"] }],
};

// Typechecked, never rendered: the five pins the review found unused on the
// old surface (the index-only ops and the hook accepted any FieldPath; the
// hook's item type had no tuple arm) plus the positive cases that must keep
// compiling: arrays of objects, optional and nullable arrays, and a nested
// array behind a template path.
export const ArrayPathPins = () => {
  const form = useForm(arraySchema, { initialValues: arrayInitial });
  const index = 0;
  form.arrayRemove("rows", 0);
  form.arrayRemove("tags", 0);
  form.arrayMove("nullableTags", 0, 1);
  form.arraySwap("rows.0.tags", 0, 1);
  form.arraySwap(`rows.${index}.tags`, 0, 1);
  form.arrayPush("rows", { id: "r1", tags: [] });
  form.arrayPush("tags", "x");
  form.arrayInsert(`rows.${index}.tags`, 0, "x");
  useFieldArray(form, "rows");
  useFieldArray(form, "tags");
  useFieldArray(form, "nullableTags");
  useFieldArray(form, `rows.${index}.tags`);
  // @ts-expect-error a string path has no index to remove
  form.arrayRemove("name", 0);
  // @ts-expect-error a string path has no rows to move
  form.arrayMove("name", 0, 1);
  // @ts-expect-error a string path has no rows to swap
  form.arraySwap("name", 0, 1);
  // @ts-expect-error a tuple has a fixed arity; no row can be removed
  form.arrayRemove("pair", 0);
  // @ts-expect-error a tuple path is not a growable array
  form.arrayPush("pair", "x");
  // @ts-expect-error a string path is not an array path
  useFieldArray(form, "name");
  // The hook used to accept the tuple and type push as string | number;
  // the pin moved up to the path, which the hook now refuses outright.
  // @ts-expect-error a tuple path is not an array path
  useFieldArray(form, "pair");
  return null;
};

// A pathDepth: 12 form used to be TS2375 against the depth-less prop type.
export const DeepDevtools = () => {
  const deep = createForm(arraySchema, {
    initialValues: arrayInitial,
    pathDepth: 12,
  });
  return <FormstandDevtools form={deep} />;
};

describe("array ops and useFieldArray take array paths only", () => {
  it("ArrayFieldPath / ArrayPathsOf keep exactly the variable-length array paths", () => {
    type Values = z.input<typeof arraySchema>;
    type Expected = "tags" | "nullableTags" | "rows" | `rows.${number}.tags`;
    expectTypeOf<ArrayFieldPath<Values>>().toEqualTypeOf<Expected>();
    expectTypeOf<ArrayPathsOf<Form<typeof arraySchema>>>().toEqualTypeOf<Expected>();
    expectTypeOf<ArrayPathsOf<FieldFormApi>>().toEqualTypeOf<string>();
  });

  it("the unified ArrayItemOf strips wrappers and refuses tuples", () => {
    type Values = z.input<typeof arraySchema>;
    expectTypeOf<ArrayItemOf<string[] | undefined>>().toEqualTypeOf<string>();
    expectTypeOf<ArrayItemOf<string[] | null>>().toEqualTypeOf<string>();
    expectTypeOf<ArrayItemOf<[string, number]>>().toEqualTypeOf<never>();
    expectTypeOf<ArrayItemOf<string>>().toEqualTypeOf<never>();
    expectTypeOf<ArrayItemOf<Values["rows"]>>().toEqualTypeOf<{
      id: string;
      tags: string[];
    }>();
  });

  it("the typed hook infers items through optional and nested array paths", () => {
    const { result } = renderHook(() => {
      const form = useForm(arraySchema, { initialValues: arrayInitial });
      const index = 0;
      return {
        tags: useFieldArray(form, "tags"),
        rowTags: useFieldArray(form, `rows.${index}.tags`),
      };
    });
    expectTypeOf(result.current.tags.push).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(result.current.rowTags.items).toEqualTypeOf<readonly string[]>();
    expect(result.current.tags.length).toBe(0);
    expect(result.current.rowTags.length).toBe(1);
  });

  it("createFormHooks' bound field array takes array paths only", () => {
    const form = createForm(arraySchema, { initialValues: arrayInitial });
    const { useFieldArray: useBound } = createFormHooks(form);
    const neverRuns = () => {
      useBound("rows");
      // @ts-expect-error a string path is not an array path
      useBound("name");
    };
    expect(typeof neverRuns).toBe("function");
  });
});

describe("the exports the changelog promises", () => {
  it("path filters, the array types, and the Bound* hooks are importable from the root", () => {
    type F = Form<typeof arraySchema>;
    expectTypeOf<PathsAccepting<F, string | null | undefined>>().toEqualTypeOf<
      | "name"
      | "pair.0"
      | `rows.${number}.id`
      | `rows.${number}.tags.${number}`
      | `tags.${number}`
      | `nullableTags.${number}`
    >();
    expectTypeOf<SelectValueAt<F, "name">>().toEqualTypeOf<string>();
    expectTypeOf<BoundUseFields<typeof arraySchema>>().toBeFunction();
    expectTypeOf<BoundUseVariantField<typeof arraySchema>>().toBeFunction();
  });

  it("FormstandDevtoolsProps carries the form's depth", () => {
    expectTypeOf<
      FormstandDevtoolsProps<typeof arraySchema, 12>["form"]
    >().toEqualTypeOf<Form<typeof arraySchema, 12>>();
    expectTypeOf<
      FormstandDevtoolsProps<typeof arraySchema>["form"]
    >().toEqualTypeOf<Form<typeof arraySchema>>();
  });
});


describe("hooks read prototype-named paths as own keys", () => {
  // A schema MAY declare a field named after an Object.prototype member;
  // the typed path is then perfectly legal and the maps must not leak the
  // prototype's function as the field's error or touched flag.
  const schema = z.object({
    constructor: z.string(),
    toString: z.string(),
    tags: z.array(z.string()),
  });
  const initialValues = { constructor: "", toString: "", tags: [] };

  it("useField reports undefined/false for an untouched prototype-named field", () => {
    const form = createForm(schema, { initialValues });
    const { result } = renderHook(() => ({
      ctor: useField(form, "constructor"),
      str: useField(form, "toString"),
    }));
    expect(result.current.ctor.error).toBeUndefined();
    expect(result.current.ctor.touched).toBe(false);
    expect(result.current.ctor.isValidating).toBe(false);
    expect(result.current.str.error).toBeUndefined();
    expect(result.current.str.touched).toBe(false);
  });

  it("useFieldArray on a prototype-named array path reads no phantom error", () => {
    const arrays = z.object({ constructor: z.array(z.string()) });
    const form = createForm(arrays, { initialValues: { constructor: [] } });
    const { result } = renderHook(() => useFieldArray(form, "constructor"));
    expect(result.current.error).toBeUndefined();
    expect(result.current.firstError).toBeUndefined();
  });
});
