import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/cli";
import { emitZodSchema, lineCommentText } from "../src/codegen";
import { fromJsonSchema } from "../src/fromJsonSchema";
import {
  captureStderr,
  freshTmpDir,
  listFiles,
  typecheckDiagnostics,
} from "./helpers";

// Security: a TODO built from JSON Schema text ($ref, type) is written as a
// `// TODO: ...` line in the emitted schema and in module field files. A
// line terminator inside that text ended the comment, and the rest became
// CODE in the user's module: a $ref of "#/nope\n  injected: ..." minted a
// real `injected` property. The same text reached stderr, where a newline
// forged a second line. Every comment and warning built from schema text
// now collapses line terminators to one space.

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

// Every terminator JavaScript knows: \n, \r\n, U+2028, U+2029.
const document = {
  type: "object",
  title: "Evil",
  properties: {
    a: { $ref: '#/nope\n  injected: z.string().transform(() => "pwned"), //' },
    b: { type: "weird\r\n  injected2: z.string(), //" },
    c: { $ref: `#/x${LS}  injected3: z.string(), //` },
    d: { $ref: `#/y${PS}  injected4: z.string(), //` },
    ok: { type: "string" },
  },
  required: ["ok"],
};

describe("schema text cannot break out of a line comment", () => {
  const { ir } = fromJsonSchema(document, { source: "evil.json", fallbackName: "evil" });

  it("lineCommentText collapses every line terminator run into one space", () => {
    expect(lineCommentText(`a\nb\r\nc${LS}d${PS}e`)).toBe("a b c d e");
    expect(lineCommentText("a\n\n\n  b")).toBe("a   b");
  });

  it("the emitted schema keeps each TODO on one line and gains no property", () => {
    const schema = emitZodSchema(ir, "evilSchema");
    expect(schema).not.toMatch(/^\s*injected\d?:/m);
    const todoLines = schema.split("\n").filter((line) => line.includes("injected"));
    expect(todoLines).toHaveLength(4);
    todoLines.forEach((line) => expect(line.trimStart().startsWith("// TODO:")).toBe(true));
  });

  it("single-file and module outputs compile with no injected property, warnings stay one line", async () => {
    const dir = freshTmpDir("comment-injection");
    const input = path.join(dir, "evil.json");
    fs.writeFileSync(input, JSON.stringify(document), "utf8");
    const single = path.join(dir, "single", "EvilForm.tsx");
    const moduleDir = path.join(dir, "module");
    fs.mkdirSync(path.dirname(single), { recursive: true });
    const text = await captureStderr(async () => {
      expect(await main([input, "--out", single])).toBe(0);
      expect(await main([input, "--layout", "module", "--out", moduleDir])).toBe(0);
    });
    const generated = listFiles(dir).filter((file) => file !== input);
    generated.forEach((file) => {
      // The payload text may survive inside the one-line comment; what
      // must not exist is a LINE that starts with the injected key.
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/^\s*injected\d?:/m);
    });
    expect(typecheckDiagnostics(generated)).toEqual([]);
    // Every stderr line is a warning or a real "wrote <path>" line of the
    // CLI's own: the payload cannot forge a "wrote src/Evil.tsx" line, and
    // each warning ends on the line it started.
    const lines = text.split("\n").filter((line) => line !== "");
    const warnings = lines.filter((line) => line.startsWith("warning:"));
    expect(warnings).toHaveLength(8);
    warnings.forEach((line) => expect(line).toMatch(/injected\d?: z\.string\(\)/));
    lines
      .filter((line) => !line.startsWith("warning:"))
      .forEach((line) => expect(line).toMatch(/^wrote .*comment-injection[\\/]/));
    expect([...text].some((ch) => ch === "\r" || ch === LS || ch === PS)).toBe(false);
  });
});
