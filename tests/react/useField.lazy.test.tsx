import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createForm } from "../../src/core/createForm";
import { TextField } from "../../src/react/fields";
import { useField } from "../../src/react/useField";

// Regression pin for the narrow review of the round-3 diff (0.26.1): the
// introspection walk called a lazy schema's getter, and the recursive
// idiom below builds a fresh schema per call, so useField's selector saw
// a new schema node on every run and React threw "Maximum update depth
// exceeded" at mount.

afterEach(cleanup);

type Node = { readonly name: string; readonly children: readonly Node[] };

const node: z.ZodType<Node> = z.lazy(() =>
  z.object({ name: z.string(), children: z.array(node) }),
);

describe("useField under an inline z.lazy", () => {
  it("mounts a field whose schema is a recursive lazy object", () => {
    const form = createForm(z.object({ root: node }), {
      initialValues: { root: { name: "top", children: [] } },
    });
    // The recursive type annotation hides the shape from the typed paths,
    // hence the cast; the runtime walk is what this pin exercises.
    const { result, rerender } = renderHook(() =>
      useField(form, "root.name" as never),
    );
    expect(result.current.value).toBe("top");
    const emptyValue = result.current.emptyValue;
    rerender();
    expect(result.current.emptyValue).toBe(emptyValue);
  });

  it("mounts a bound component through a nested lazy row", () => {
    const form = createForm(z.object({ root: node }), {
      initialValues: {
        root: { name: "top", children: [{ name: "leaf", children: [] }] },
      },
    });
    const { container } = render(
      <TextField form={form} path={"root.children.0.name" as never} />,
    );
    expect((container.querySelector("input") as HTMLInputElement).value).toBe(
      "leaf",
    );
  });

  it("mounts under a root-level inline lazy", () => {
    const schema = z.lazy(() => z.object({ title: z.string() }));
    const form = createForm(schema, { initialValues: { title: "t" } });
    const { result } = renderHook(() => useField(form, "title"));
    expect(result.current.value).toBe("t");
  });
});
