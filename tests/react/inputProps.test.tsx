import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  checkboxProps,
  numberInputProps,
  selectProps,
  textInputProps,
} from "../../src/react/inputProps";
import { useField } from "../../src/react/useField";
import { useForm } from "../../src/react/useForm";

describe("textInputProps", () => {
  it("derives value, onChange, onBlur from a string field", () => {
    const schema = z.object({ name: z.string() });
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { name: "" } });
      return { form, name: useField(form, "name") };
    });

    const props = textInputProps(result.current.name);
    expect(props.value).toBe("");
    act(() => {
      props.onChange({
        target: { value: "Tim" },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.name.value).toBe("Tim");
  });
});

// The clearable contract (0.18): clearing a string-shaped input writes the
// field's emptyValue exactly when the schema accepts it — optional writes
// undefined, nullable writes null, defaulted writes undefined — and a
// REQUIRED string keeps "" so the schema judges a visible value instead of
// a hole it rejects. This was the documented optional-"" asymmetry; the
// schema introspection now answers it.
describe("clearable: cleared inputs write emptyValue when the schema takes it", () => {
  const schema = z.object({
    nickname: z.string().optional(),
    alias: z.string().nullable(),
    name: z.string(),
    theme: z.enum(["light", "dark"]).optional(),
    greeting: z.string().default("hi"),
  });
  const bind = () =>
    renderHook(() => {
      const form = useForm(schema, {
        initialValues: { alias: null, name: "n" } as never,
      });
      return {
        form,
        nickname: useField(form, "nickname"),
        alias: useField(form, "alias"),
        name: useField(form, "name"),
        theme: useField(form, "theme"),
        greeting: useField(form, "greeting"),
      };
    });
  const type = (
    props: Readonly<{ onChange: (e: never) => void }>,
    value: string,
  ) => {
    act(() => {
      (props.onChange as (e: unknown) => void)({ target: { value } });
    });
  };

  it("exposes clearable from the schema: optional/nullable/default yes, required no", () => {
    const { result } = bind();
    expect(result.current.nickname.clearable).toBe(true);
    expect(result.current.alias.clearable).toBe(true);
    expect(result.current.greeting.clearable).toBe(true);
    expect(result.current.name.clearable).toBe(false);
  });

  it("an optional string clears to undefined and reads pristine again", () => {
    const { result } = bind();
    type(textInputProps(result.current.nickname), "draft");
    expect(result.current.nickname.value).toBe("draft");
    type(textInputProps(result.current.nickname), "");
    expect(result.current.nickname.value).toBe(undefined);
    expect(result.current.nickname.dirty).toBe(false);
  });

  it("a nullable string still clears to null", () => {
    const { result } = bind();
    type(textInputProps(result.current.alias), "x");
    type(textInputProps(result.current.alias), "");
    expect(result.current.alias.value).toBe(null);
  });

  it("a required string cleared to empty stays the empty string", () => {
    const { result } = bind();
    type(textInputProps(result.current.name), "");
    expect(result.current.name.value).toBe("");
  });

  it("an optional select clears back to undefined", () => {
    const { result } = bind();
    type(selectProps(result.current.theme), "dark");
    expect(result.current.theme.value).toBe("dark");
    type(selectProps(result.current.theme), "");
    expect(result.current.theme.value).toBe(undefined);
  });

});

describe("numberInputProps", () => {
  const schema = z.object({ age: z.number().optional() });

  it("renders empty for undefined and parses on change", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { age: undefined } });
      return { form, age: useField(form, "age") };
    });

    let props = numberInputProps(result.current.age);
    expect(props.value).toBe("");
    expect(props.type).toBe("number");

    act(() => {
      props.onChange({
        target: { value: "42" },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.age.value).toBe(42);

    props = numberInputProps(result.current.age);
    expect(props.value).toBe("42");
  });

  it("clears to undefined on empty string", () => {
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { age: 30 } });
      return { form, age: useField(form, "age") };
    });

    const props = numberInputProps(result.current.age);
    act(() => {
      props.onChange({
        target: { value: "" },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.age.value).toBeUndefined();
  });

  it("keeps the stored value on unparseable input", () => {
    // Partial entries ("-", "1e", pasted junk) must not clobber the value
    // mid-keystroke — matching useNumberInput's semantics. Only genuinely
    // EMPTY text clears to emptyValue.
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { age: 1 } });
      return { form, age: useField(form, "age") };
    });

    const props = numberInputProps(result.current.age);
    act(() => {
      props.onChange({
        target: { value: "abc" },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.age.value).toBe(1);

    act(() => {
      numberInputProps(result.current.age).onChange({
        target: { value: "" },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.age.value).toBeUndefined();
  });
});

describe("checkboxProps", () => {
  it("toggles via checked", () => {
    const schema = z.object({ ok: z.boolean() });
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { ok: false } });
      return { form, ok: useField(form, "ok") };
    });
    const props = checkboxProps(result.current.ok);
    expect(props.checked).toBe(false);
    expect(props.type).toBe("checkbox");
    act(() => {
      props.onChange({
        target: { checked: true },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.ok.value).toBe(true);
  });
});

describe("selectProps", () => {
  it("derives value and casts on change", () => {
    const schema = z.object({ theme: z.enum(["light", "dark"]) });
    const { result } = renderHook(() => {
      const form = useForm(schema, { initialValues: { theme: "light" } });
      return { form, theme: useField(form, "theme") };
    });
    const props = selectProps(result.current.theme);
    expect(props.value).toBe("light");
    act(() => {
      props.onChange({
        target: { value: "dark" },
      } as unknown as React.ChangeEvent<HTMLSelectElement>);
    });
    expect(result.current.theme.value).toBe("dark");
  });
});
