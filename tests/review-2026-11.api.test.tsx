import { act, renderHook } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { createForm } from "../src/core/createForm";
import type { ErrorPath } from "../src/core/createForm";
import { type PersistStorage } from "../src/core/persist";
import { createFormHooks } from "../src/react/createFormHooks";
import { blurField, fillAndBlurField, fillField } from "../src/testing";

// Regression pins for the November 2026 review, API tightening: the
// options-object shape of submit and handleSubmit, the exported ErrorPath,
// the three hooks createFormHooks used to skip, the fuller FieldSnapshot,
// and the testing helpers handing back their validation result.

const schema = z.object({
  name: z.string().min(1, "name required"),
  age: z.number(),
});
const valid = { name: "Ada", age: 36 };
const invalid = { name: "", age: 36 };

describe("submit and handleSubmit take an options object", () => {
  it("onInvalid rides in the options object", async () => {
    const form = createForm(schema, { initialValues: invalid });
    const onInvalid = vi.fn();
    const result = await form.submit(() => {}, { onInvalid });
    expect(result.kind).toBe("invalid");
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(form.getState().touched["name"]).toBe(true);
  });

  it("onError and force ride along", async () => {
    const form = createForm(schema, { initialValues: valid });
    const onError = vi.fn();
    const result = await form.submit(
      () => {
        throw new Error("save failed");
      },
      { onError },
    );
    expect(result.kind).toBe("error");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));

    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 10));
    const first = form.submit(slow);
    const second = form.submit(slow, { force: true });
    const third = form.submit(slow);
    expect((await third).kind).toBe("skipped");
    expect((await second).kind).toBe("valid");
    expect((await first).kind).toBe("valid");
  });

  it("a positional onInvalid wins over options.onInvalid", async () => {
    const form = createForm(schema, { initialValues: invalid });
    const positional = vi.fn();
    const inOptions = vi.fn();
    await form.submit(() => {}, positional, { onInvalid: inOptions });
    expect(positional).toHaveBeenCalledTimes(1);
    expect(inOptions).not.toHaveBeenCalled();
  });

  it("handleSubmit accepts the same shape and still warns without onError", async () => {
    const form = createForm(schema, { initialValues: valid });
    const onInvalid = vi.fn();
    const onError = vi.fn();
    const preventDefault = vi.fn();
    const handler = form.handleSubmit(
      () => {
        throw new Error("save failed");
      },
      { onInvalid, onError },
    );
    const result = await handler({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe("error");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onInvalid).not.toHaveBeenCalled();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await form.handleSubmit(() => {
        throw new Error("unobserved");
      }, {})();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Pass { onError }"),
        expect.any(Error),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("the positional shape is unchanged", async () => {
    const form = createForm(schema, { initialValues: invalid });
    const onInvalid = vi.fn();
    const result = await form.submit(() => {}, onInvalid, { force: true });
    expect(result.kind).toBe("invalid");
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorPath is exported", () => {
  it("is FieldPath plus the root key", () => {
    type Values = z.input<typeof schema>;
    expectTypeOf<ErrorPath<Values>>().toEqualTypeOf<"name" | "age" | "">();
    const form = createForm(schema, { initialValues: valid });
    const root: ErrorPath<Values> = "";
    form.setError(root, "form-wide");
    expect(form.getState().errors[""]).toEqual(["form-wide"]);
  });
});

describe("createFormHooks binds the action bridges and persistence", () => {
  const memoryStorage = (): PersistStorage & {
    readonly map: Map<string, string>;
  } => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
    };
  };

  it("use{Name}Persist persists the bound form", () => {
    const form = createForm(schema, { initialValues: valid });
    const { useInvoicePersist, useInvoiceAction, useInvoiceActionState } =
      createFormHooks(form, "invoice");
    expectTypeOf(useInvoiceAction).toBeFunction();
    expectTypeOf(useInvoiceActionState).toBeFunction();
    const storage = memoryStorage();
    const { result } = renderHook(() =>
      useInvoicePersist({ key: "invoice-draft", storage, debounceMs: 0 }),
    );
    act(() => {
      form.setValue("name", "Grace");
    });
    expect(JSON.parse(storage.map.get("invoice-draft") ?? "null")).toEqual({
      name: "Grace",
      age: 36,
    });
    act(() => {
      result.current.clear();
    });
    expect(storage.map.size).toBe(0);
  });

  it("use{Name}Action runs the submit lifecycle on the bound form", async () => {
    const form = createForm(schema, { initialValues: invalid });
    const { useInvoiceAction } = createFormHooks(form, "invoice");
    const onValid = vi.fn();
    const onInvalid = vi.fn();
    const { result } = renderHook(() => useInvoiceAction(onValid, { onInvalid }));
    await act(async () => {
      await result.current(new FormData());
    });
    expect(onValid).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(form.getState().submitCount).toBe(1);
  });

  it("unnamed keys are the bare spellings", () => {
    const hooks = createFormHooks(createForm(schema, { initialValues: valid }));
    expect(Object.keys(hooks)).toEqual(
      expect.arrayContaining(["useAction", "useActionState", "usePersist"]),
    );
  });
});

describe("FieldSnapshot carries initialValue and firstError", () => {
  it("getFieldState and watchField agree with useField's slice", () => {
    const form = createForm(schema, { initialValues: invalid });
    form.validate();
    const snapshot = form.getFieldState("name");
    expect(snapshot.initialValue).toBe("");
    expect(snapshot.firstError).toBe("name required");
    expect(snapshot.error).toEqual(["name required"]);

    const seen: string[] = [];
    form.watchField("name", (next) => {
      seen.push(`${String(next.initialValue)}|${String(next.firstError)}`);
    });
    // A rebase changes initialValue alone (value too, to the same thing):
    // the listener must fire for it.
    form.adoptValues({ name: "Ada", age: 1 });
    expect(seen).toEqual(["Ada|undefined"]);
  });
});

describe("the testing helpers return their validation result", () => {
  it("fillField and blurField hand back the gate's result, or undefined", () => {
    const form = createForm(schema, { initialValues: valid, mode: "onBlur" });
    expect(fillField(form, "name", "")).toBeUndefined();
    const blurred = blurField(form, "name");
    expect(blurred?.kind).toBe("invalid");
    expect(fillField(form, "name", "")).toBeUndefined();
    const again = fillAndBlurField(form, "name", "Grace");
    expect(again?.kind).toBe("valid");
  });

  it("a pending result can be awaited", async () => {
    const asyncSchema = z.object({
      username: z.string().refine(
        async (v) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return v !== "taken";
        },
        { message: "taken" },
      ),
    });
    const form = createForm(asyncSchema, {
      initialValues: { username: "free" },
      mode: "onChange",
    });
    const result = fillField(form, "username", "taken");
    expect(result?.kind).toBe("pending");
    if (result?.kind === "pending") {
      const settled = await result.promise;
      expect(settled.kind).toBe("invalid");
    }
    expect(form.getState().errors["username"]).toEqual(["taken"]);
  });
});
