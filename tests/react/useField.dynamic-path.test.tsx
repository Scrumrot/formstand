import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

const schema = z.object({
  selectedIndex: z.number(),
  users: z.array(z.object({ email: z.string() })),
});

describe("useField with dynamic path selector", () => {
  it("resolves the path from state and re-resolves when state changes", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          selectedIndex: 0,
          users: [{ email: "a@a.com" }, { email: "b@b.com" }],
        },
      });
      const email = useField(
        form,
        (s) => `users.${s.values.selectedIndex}.email` as const,
      );
      return { form, email };
    });

    expect(result.current.email.value).toBe("a@a.com");

    act(() => {
      result.current.form.setValue("selectedIndex", 1);
    });

    expect(result.current.email.value).toBe("b@b.com");
  });

  it("setValue writes to the currently-resolved path", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, {
        initialValues: {
          selectedIndex: 0,
          users: [{ email: "a@a.com" }, { email: "b@b.com" }],
        },
      });
      const email = useField(
        form,
        (s) => `users.${s.values.selectedIndex}.email` as const,
      );
      return { form, email };
    });

    act(() => {
      result.current.form.setValue("selectedIndex", 1);
    });
    act(() => {
      result.current.email.setValue("new@b.com");
    });

    expect(result.current.form.getState().values.users[1]?.email).toBe(
      "new@b.com",
    );
    expect(result.current.form.getState().values.users[0]?.email).toBe(
      "a@a.com",
    );
  });
});
