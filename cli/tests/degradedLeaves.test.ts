import { describe, expect, it } from "vitest";
import {
  type EmitFormOptions,
  emitAntdForm,
  emitChakraForm,
  emitMantineForm,
  emitMuiForm,
  emitPlainForm,
  emitShadcnForm,
} from "../src/codegen";
import {
  antdStubPaths,
  chakraStubPaths,
  freshTmpDir,
  mantineStubPaths,
  muiStubPaths,
  shadcnStubFile,
  typecheckDiagnostics,
  writeSingleFile,
} from "./helpers";
import { degradedLeavesSchema } from "./fixtures/degradedLeavesSchema";
import { coerceSchema } from "./fixtures/coerceSchema";

// The library's bound components type their `path` prop by VALUE
// (PathsAccepting): `<TextField path="meta" />` on a z.record is a compile
// error. Every walker-degraded leaf is a text stand-in bound exactly that
// way in the plain single-file layout, so NO degraded schema compiled. The
// kits were safe at the root (their Bound components are pinned) but not in
// union variants, where every backend spreads a hoisted hook into a text
// builder. Each backend's output for the fixture must typecheck as one
// program.

type Emitter = (options: EmitFormOptions) => string;

const perBackend = (
  emit: Emitter,
  tag: string,
): Readonly<{
  degraded: Readonly<{ file: string; code: string }>;
  files: readonly string[];
}> => {
  const dir = freshTmpDir(`degraded-single-${tag}`);
  const degraded = writeSingleFile(
    emit,
    degradedLeavesSchema,
    "degradedLeavesSchema",
    "DegradedForm",
    dir,
  );
  const coerce = writeSingleFile(emit, coerceSchema, "coerceSchema", "CoerceForm", dir);
  return { degraded, files: [degraded.file, coerce.file] };
};

describe("degraded leaves compile in the single-file layout", () => {
  const plain = perBackend(emitPlainForm, "plain");

  it("plain: record, bigint, lazy, any, literal, numeric enum, map, coerce, in every position", () => {
    expect(typecheckDiagnostics(plain.files)).toEqual([]);
    // The TODO stays above the stand-in; the stand-in is no longer the
    // by-value TextField, whose path type refuses a non-text value.
    expect(plain.degraded.code).toContain(
      '{/* TODO: unsupported zod type "record"; defaulted to string */}',
    );
    expect(plain.degraded.code).not.toContain('<TextField form={form} path={"meta"}');
    expect(plain.degraded.code).toContain('<PlaceholderField form={form} path={"meta"}');
    expect(plain.degraded.code).toContain(
      "const field = useField<string | null | undefined>(form, path);",
    );
    // Healthy text leaves keep the typed component.
    expect(plain.degraded.code).toContain('<TextField form={form} path={"name"}');
    // A degraded union variant field is pinned at its hoisted hook.
    expect(plain.degraded.code).toContain(
      'useVariantField(form, "payment", "extra") as unknown as UseFieldReturn<string | null | undefined>;',
    );
  });

  it.each([
    ["mui", emitMuiForm, muiStubPaths, []],
    ["shadcn", emitShadcnForm, {}, [shadcnStubFile]],
    ["chakra", emitChakraForm, chakraStubPaths, []],
    ["mantine", emitMantineForm, mantineStubPaths, []],
    ["antd", emitAntdForm, antdStubPaths, []],
  ] as const)("%s: the same fixture compiles", (tag, emit, stubPaths, extraFiles) => {
    const kit = perBackend(emit, tag);
    expect(typecheckDiagnostics([...kit.files, ...extraFiles], stubPaths)).toEqual([]);
  });
});
