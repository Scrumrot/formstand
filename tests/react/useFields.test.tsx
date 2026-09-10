import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { useFields } from "../../src/react/useFields";
import { useForm } from "../../src/react/useForm";

// Composite fields — the airfield-maps coordinate pair: one DMS input
// backed by two schema paths, coordinated by hand until now.
const schema = z
  .object({
    latitude: z.number().min(-90, "latitude out of range"),
    longitude: z.number().min(-180, "longitude out of range"),
    label: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.latitude === 0 && values.longitude === 0) {
      const message = "null island is not a location";
      ctx.addIssue({ code: "custom", message, path: ["latitude"] });
      ctx.addIssue({ code: "custom", message, path: ["longitude"] });
    }
  });

const setup = () =>
  renderHook(() => {
    const form = useForm(schema, {
      initialValues: { latitude: 10, longitude: 20, label: "" },
      mode: "onBlur",
    });
    return { form, location: useFields(form, ["latitude", "longitude"]) };
  });

describe("useFields", () => {
  it("maps the tuple position-for-position with full field returns", () => {
    const { result } = setup();
    const [latitude, longitude] = result.current.location.fields;
    expectTypeOf(latitude.value).toEqualTypeOf<number>();
    expectTypeOf(longitude.value).toEqualTypeOf<number>();
    expect(latitude.path).toBe("latitude");
    expect(longitude.path).toBe("longitude");

    // Each element is a REAL UseFieldReturn: writes land per path.
    act(() => latitude.setValue(45));
    expect(result.current.form.getState().values.latitude).toBe(45);
  });

  it("merges errors in path order and dedupes shared messages", () => {
    const { result } = setup();
    act(() => {
      const [latitude, longitude] = result.current.location.fields;
      latitude.setValue(0);
      longitude.setValue(0);
      result.current.location.fields[0].validate();
      result.current.location.fields[1].validate();
    });
    // The cross-field refine stamps BOTH paths with one message — the
    // combined channel reads it once.
    expect(result.current.location.error).toEqual([
      "null island is not a location",
    ]);
    expect(result.current.location.firstError).toBe(
      "null island is not a location",
    );
  });

  it("answers touched/dirty as any-of-them and blurs every path at once", () => {
    const { result } = setup();
    expect(result.current.location.touched).toBe(false);
    expect(result.current.location.dirty).toBe(false);

    act(() => result.current.location.fields[0].setValue(11));
    expect(result.current.location.dirty).toBe(true);

    act(() => result.current.location.onBlur());
    expect(result.current.form.getState().touched["latitude"]).toBe(true);
    expect(result.current.form.getState().touched["longitude"]).toBe(true);
    expect(result.current.location.touched).toBe(true);
  });

  it("keeps distinct per-path messages side by side", () => {
    const { result } = setup();
    act(() => {
      result.current.location.fields[0].setError("bad lat");
      result.current.location.fields[1].setError("bad lng");
    });
    expect(result.current.location.error).toEqual(["bad lat", "bad lng"]);
  });
});

describe("useFields stable-arity contract", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a tuple that changes length throws React's own hooks-count error", () => {
    // The contract is enforced by React itself, at the exact render that
    // broke it — the hook needs (and has) no guard of its own. Pinned so
    // a future refactor away from per-path hook calls updates this
    // deliberately.
    const { rerender } = renderHook(
      ({ paths }: Readonly<{ paths: readonly string[] }>) => {
        const form = useForm(schema, {
          initialValues: { latitude: 0, longitude: 0, label: "" },
        });
        return useFields(form as never, paths);
      },
      { initialProps: { paths: ["latitude", "longitude"] as readonly string[] } },
    );
    expect(() => {
      rerender({ paths: ["latitude"] as readonly string[] });
    }).toThrowError(/Rendered fewer hooks than expected/);
  });
});
