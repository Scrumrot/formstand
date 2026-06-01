import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useFieldArray } from "../../src/react/useFieldArray";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  albums: z.array(
    z.object({
      title: z.string(),
      tracks: z.array(z.object({ title: z.string() })),
    }),
  ),
});

const initial = {
  albums: [
    { title: "A", tracks: [{ title: "a1" }, { title: "a2" }] },
    { title: "B", tracks: [{ title: "b1" }] },
  ],
};

describe("nested useFieldArray", () => {
  it("mutating the inner array preserves outer items", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: initial });
      const albums = useFieldArray(form, "albums");
      const tracks0 = useFieldArray<{ title: string }>(
        form,
        "albums.0.tracks",
      );
      const tracks1 = useFieldArray<{ title: string }>(
        form,
        "albums.1.tracks",
      );
      return { form, albums, tracks0, tracks1 };
    });

    act(() => {
      result.current.tracks0.push({ title: "a3" });
    });

    expect(result.current.tracks0.items.map((t) => t.title)).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
    expect(result.current.tracks1.items).toHaveLength(1);
    expect(result.current.albums.length).toBe(2);
  });

  it("removing an outer item shifts inner items' meta correctly", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: initial });
      const albums = useFieldArray(form, "albums");
      return { form, albums };
    });

    act(() => {
      result.current.form.setTouched("albums.0.tracks.0.title", true);
      result.current.form.setTouched("albums.1.tracks.0.title", true);
    });

    act(() => {
      result.current.albums.remove(0);
    });

    expect(result.current.albums.items).toHaveLength(1);
    expect(
      result.current.form.getState().touched["albums.0.tracks.0.title"],
    ).toBe(true);
    expect(
      result.current.form.getState().touched["albums.1.tracks.0.title"],
    ).toBeUndefined();
  });

  it("re-initializes inner field-array IDs when path changes", () => {
    const { result, rerender } = renderHook(
      ({ pathIndex }: { pathIndex: number }) => {
        const form = useForm(schema, { initialValues: initial });
        return {
          form,
          tracks: useFieldArray(form, `albums.${pathIndex}.tracks`),
        };
      },
      { initialProps: { pathIndex: 0 } },
    );

    const albumZeroIds = result.current.tracks.fields.map((f) => f.id);
    expect(albumZeroIds).toHaveLength(2);

    rerender({ pathIndex: 1 });

    const albumOneIds = result.current.tracks.fields.map((f) => f.id);
    expect(albumOneIds).toHaveLength(1);
    expect(albumZeroIds).not.toContain(albumOneIds[0]);
  });
});
