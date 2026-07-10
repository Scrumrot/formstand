import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { DateField } from "../../src/react/fields";
import {
  dateInputProps,
  dateToInputText,
  parseDateText,
} from "../../src/react/inputProps";
import { useForm } from "../../src/react/useForm";

afterEach(cleanup);

describe("dateToInputText", () => {
  it("renders the LOCAL calendar date, padded", () => {
    // Local-midnight construction must round-trip regardless of the test
    // machine's timezone — that's the whole point of avoiding toISOString.
    expect(dateToInputText(new Date(2026, 5, 1))).toBe("2026-06-01");
    expect(dateToInputText(new Date(999, 0, 2))).toBe("0999-01-02");
  });

  it("empty for null/undefined/Invalid Date", () => {
    expect(dateToInputText(null)).toBe("");
    expect(dateToInputText(undefined)).toBe("");
    expect(dateToInputText(new Date("nope"))).toBe("");
  });
});

describe("parseDateText", () => {
  it("parses to local midnight", () => {
    const parsed = parseDateText("2026-06-01");
    expect(parsed.kind).toBe("date");
    if (parsed.kind === "date") {
      expect(parsed.value.getFullYear()).toBe(2026);
      expect(parsed.value.getMonth()).toBe(5);
      expect(parsed.value.getDate()).toBe(1);
      expect(parsed.value.getHours()).toBe(0);
    }
  });

  it("empty and invalid are distinct from dates", () => {
    expect(parseDateText("").kind).toBe("empty");
    expect(parseDateText("  ").kind).toBe("empty");
    expect(parseDateText("June 1").kind).toBe("invalid");
    // Rollover (Feb 31) must not silently become March 3.
    expect(parseDateText("2026-02-31").kind).toBe("invalid");
  });
});

const schema = z.object({
  startDate: z.date(),
  endDate: z.date().nullable(),
});

type Values = Readonly<{ startDate?: Date; endDate: Date | null }>;

const state: { read: (() => Values) | null } = { read: null };

const Harness = () => {
  const form = useForm(schema, {
    // A blank form: the required date intentionally starts undefined (the
    // same cast the CLI emits for required dates).
    initialValues: { endDate: null } as unknown as z.input<typeof schema>,
  });
  state.read = () => form.getState().values as Values;
  return (
    <div>
      <DateField form={form} path="startDate" label="Start" />
      <DateField form={form} path="endDate" label="End" />
    </div>
  );
};

describe("DateField", () => {
  it("writes Date values and renders them back as yyyy-MM-dd", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Start") as HTMLInputElement;
    expect(input.type).toBe("date");

    fireEvent.change(input, { target: { value: "2026-07-10" } });
    const written = state.read?.().startDate;
    expect(written instanceof Date).toBe(true);
    expect(written?.getFullYear()).toBe(2026);
    expect(written?.getMonth()).toBe(6);
    expect(written?.getDate()).toBe(10);
    expect(input.value).toBe("2026-07-10");
  });

  it("clearing a nullable date restores null (the emptyValue round-trip)", () => {
    render(<Harness />);
    const input = screen.getByLabelText("End") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-10" } });
    expect(state.read?.().endDate).toBeInstanceOf(Date);

    fireEvent.change(input, { target: { value: "" } });
    expect(state.read?.().endDate).toBe(null);
    expect(input.value).toBe("");
  });

  it("dateInputProps carries the aria-invalid contract", () => {
    const field = {
      path: "startDate",
      value: undefined,
      error: ["required"],
      emptyValue: undefined,
      setValue: () => {},
      onBlur: () => {},
    };
    const props = dateInputProps(field as never);
    expect(props["aria-invalid"]).toBe(true);
    expect(props.type).toBe("date");
  });
});
