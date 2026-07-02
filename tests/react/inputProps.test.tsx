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

  it("rejects NaN input by setting undefined", () => {
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
