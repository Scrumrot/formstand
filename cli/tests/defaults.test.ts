import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { main, moduleSpecifier } from "../src/cli";
import {
  blankNeedsCast,
  droppedDefaultFieldPaths,
  emitInitialValues,
  emitPlainForm,
} from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { fixturesDir, freshTmpDir, typecheckDiagnostics } from "./helpers";
import { customDefaultSchema } from "./fixtures/customDefaultSchema";
import { defaultsSchema } from "./fixtures/defaultsSchema";
import {
  callTracker,
  functionDefaultSchema,
} from "./fixtures/functionDefaultSchema";
import { nonDeterministicDefaultSchema } from "./fixtures/nonDeterministicDefaultSchema";

// `.default()` values must land in the generated initialValues whenever the
// captured value is a JSON-serializable primitive matching the field kind
// (string / finite number / boolean / declared enum option); dates and
// container defaults keep the blank-form behavior. The value is captured
// off the zod def (`defaultValue` — a resolved value in zod v4, a factory
// in older shapes) into the IR's `defaultValue`.

describe("fromZod default capture", () => {
  it("captures value and factory defaults, and prefault", () => {
    const ir = fromZod(
      z.object({
        plain: z.string().default("x"),
        factory: z.number().default(() => 7),
        pre: z.string().prefault("y"),
      }),
    );
    if (ir.kind !== "object") throw new Error("expected object root");
    expect(ir.fields.map((f) => f.spec.defaultValue)).toEqual(["x", 7, "y"]);
    // A defaulted field stays optional in z.input.
    expect(ir.fields.every((f) => f.spec.optional)).toBe(true);
  });
});

describe("defaults in emitInitialValues", () => {
  const values = emitInitialValues(fromZod(defaultsSchema), 0);

  it("seeds matching primitive defaults", () => {
    expect(values).toContain('theme: "light",');
    expect(values).toContain("retries: 3,");
    expect(values).toContain("newsletter: true,");
    expect(values).toContain('plan: "pro",');
    // A factory default is called and its value captured.
    expect(values).toContain("factory: 42,");
    // Escaping goes through the shared string-literal helper.
    expect(values).toContain('quoted: "say \\"hi\\"",');
  });

  it("skips dates and containers (blank-form behavior)", () => {
    // No Date literal exists in source; the optional date starts undefined.
    expect(values).toContain("createdAt: undefined,");
    // A container default is ignored; arrays always start empty.
    expect(values).toContain("tags: [],");
  });

  it("skips a default that does not match the field kind", () => {
    const ir = fromZod(
      z.object({
        // "gold" is not a declared option — seeding it would emit a type
        // error, so the enum falls back to its blank behavior.
        plan: z.enum(["free", "pro"]).default("gold" as "free"),
      }),
    );
    expect(emitInitialValues(ir, 0)).toContain("plan: undefined,");
  });

  it("a seeded default satisfies z.input, avoiding the blank cast", () => {
    // Every field is defaulted or blankable, so the draft gets the checked
    // annotation, not the as-unknown-as escape hatch.
    expect(blankNeedsCast(fromZod(defaultsSchema))).toBe(false);
  });
});

describe("defaults the capture must refuse", () => {
  it("never seeds a default into a todo fallback (z.custom + .default)", () => {
    const ir = fromZod(customDefaultSchema);
    if (ir.kind !== "object") throw new Error("expected object root");
    const accent = ir.fields.find((field) => field.name === "accent");
    // The value IS captured off the def (a deterministic string)...
    expect(accent?.spec.defaultValue).toBe("#c0ffee");
    expect(accent?.spec.todo).toBeDefined();
    // ...but the emitter refuses to seed it: the fallback kind lies about
    // the field's real input type, so the field keeps its blank behavior.
    expect(emitInitialValues(ir, 0)).toContain("accent: undefined,");
    expect(emitInitialValues(ir, 0)).not.toContain("#c0ffee");
  });

  it("the todo-fallback output typechecks with its checked annotation", () => {
    const dir = freshTmpDir("defaults-custom");
    const code = emitPlainForm({
      ir: fromZod(customDefaultSchema),
      formName: "CustomDefaultForm",
      schemaImport: {
        name: "customDefaultSchema",
        from: moduleSpecifier(
          dir,
          path.join(fixturesDir, "customDefaultSchema.ts"),
        ),
        kind: "named",
      },
    });
    // The old seeding put "#c0ffee" (a plain string) in the HexColor slot,
    // breaking exactly this checked annotation.
    expect(code).toContain("const initialValues: FormValues =");
    expect(code).not.toContain("#c0ffee");
    const file = path.join(dir, "CustomDefaultForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    expect(typecheckDiagnostics([file])).toEqual([]);
  });

  it("a function-valued resolved default is neither invoked nor captured", () => {
    const ir = fromZod(functionDefaultSchema);
    if (ir.kind !== "object") throw new Error("expected object root");
    const onPing = ir.fields.find((field) => field.name === "onPing");
    expect(onPing?.spec.defaultValue).toBeUndefined();
    // The fixture's tracker proves the resolved function never ran: reading
    // zod's defaultValue getter resolves the factory (returning the
    // callback), and the walk must stop there.
    expect(callTracker.called).toBe(false);
    expect(emitInitialValues(ir, 0)).toContain("onPing: undefined,");
  });

  it("a non-deterministic factory is not captured and output is byte-stable", () => {
    const emit = (): string =>
      emitPlainForm({
        ir: fromZod(nonDeterministicDefaultSchema),
        formName: "SeqForm",
        schemaImport: {
          name: "nonDeterministicDefaultSchema",
          from: "./nonDeterministicDefaultSchema",
          kind: "named",
        },
      });
    const first = emit();
    // The counter yields a fresh value per read — no literal may land.
    expect(first).toContain("seq: undefined,");
    expect(first).not.toMatch(/seq: \d/);
    // Two full generations are byte-identical despite the impure factory.
    expect(emit()).toBe(first);
  });
});

describe("refused defaults are mirrored as warnings, never silent", () => {
  // Every refusal mode — capture-guard (function-valued, non-deterministic)
  // and emit-time (todo fallback, kind mismatch, dates/containers) — lists
  // the field exactly once; captured defaults and fields with no default at
  // all never appear.
  it("a function-valued resolved default is listed", () => {
    expect(droppedDefaultFieldPaths(fromZod(functionDefaultSchema))).toEqual([
      "onPing",
    ]);
  });

  it("a non-deterministic factory is listed", () => {
    expect(
      droppedDefaultFieldPaths(fromZod(nonDeterministicDefaultSchema)),
    ).toEqual(["seq"]);
  });

  it("a default on a todo fallback (z.custom) is listed", () => {
    expect(droppedDefaultFieldPaths(fromZod(customDefaultSchema))).toEqual([
      "accent",
    ]);
  });

  it("a kind-mismatched default is listed", () => {
    // "gold" is captured (a deterministic primitive) but the emitter
    // refuses to seed an undeclared enum option.
    const ir = fromZod(
      z.object({ plan: z.enum(["free", "pro"]).default("gold" as "free") }),
    );
    expect(droppedDefaultFieldPaths(ir)).toEqual(["plan"]);
  });

  it("captured defaults are not listed; unseedable dates/containers are", () => {
    // theme/retries/newsletter/plan/factory/quoted all seed literals — no
    // warning; the date and array defaults keep the blank behavior, so they
    // ARE listed (their .default() never reaches the generated form).
    expect(droppedDefaultFieldPaths(fromZod(defaultsSchema))).toEqual([
      "createdAt",
      "tags",
    ]);
  });

  it("fields with no default at all never warn", () => {
    expect(
      droppedDefaultFieldPaths(
        fromZod(z.object({ name: z.string(), age: z.number() })),
      ),
    ).toEqual([]);
  });

  it("the CLI prints one stderr warning per refused default", async () => {
    const dir = freshTmpDir("defaults-warn");
    const out = path.join(dir, "CustomDefaultForm.tsx");
    const chunks: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(((chunk: unknown): boolean => {
        chunks.push(String(chunk));
        return true;
      }) as typeof process.stderr.write);
    try {
      expect(
        await main([
          path.join(fixturesDir, "customDefaultSchema.ts"),
          "--export",
          "customDefaultSchema",
          "--out",
          out,
        ]),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
    const text = chunks.join("");
    expect(text).toContain(
      'warning: field "accent" has a .default() the CLI could not capture (non-primitive, non-deterministic, or degraded field); it starts blank — seed it by hand',
    );
    // Exactly one refused default in this fixture — one warning.
    expect(
      text.match(/has a \.default\(\) the CLI could not capture/g),
    ).toHaveLength(1);
  });
});

describe("defaults end to end", () => {
  it("the generated component carries the defaults and typechecks", () => {
    const dir = freshTmpDir("defaults-plain");
    const code = emitPlainForm({
      ir: fromZod(defaultsSchema),
      formName: "DefaultsForm",
      schemaImport: {
        name: "defaultsSchema",
        from: moduleSpecifier(dir, path.join(fixturesDir, "defaultsSchema.ts")),
        kind: "named",
      },
    });
    expect(code).toContain('theme: "light",');
    expect(code).toContain("const initialValues: FormValues =");
    expect(code).not.toContain("as unknown as FormValues");
    const file = path.join(dir, "DefaultsForm.tsx");
    fs.writeFileSync(file, code, "utf8");
    expect(typecheckDiagnostics([file])).toEqual([]);
  });
});
