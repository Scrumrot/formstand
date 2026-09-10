import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { describe, expect, it } from "vitest";
import { emitZodSchema } from "../src/codegen";
import { fromZod } from "../src/fromZod";
import { freshTmpDir } from "./helpers";
import { profileSchema } from "./fixtures/profileSchema";

describe("emitZodSchema", () => {
  it("round-trips: emitted source loads and walks back to the same IR", async () => {
    const ir = fromZod(profileSchema);
    const source = emitZodSchema(ir, "roundTripSchema");
    const dir = freshTmpDir("roundtrip");
    const file = path.join(dir, "roundTripSchema.ts");
    fs.writeFileSync(file, source, "utf8");

    const jiti = createJiti(import.meta.url);
    const mod = (await jiti.import(pathToFileURL(file).href)) as Readonly<
      Record<string, unknown>
    >;
    expect(fromZod(mod["roundTripSchema"])).toEqual(ir);
  });

  // Formats and defaults ride into the generated validator (the JSON
  // Schema mode is the frontend that carries them): z.email()/z.url()/
  // z.uuid() emit as the top-level spellings, and a kind-matching default
  // emits .default(literal). Re-walking the emitted source captures both —
  // with .default()'s one deliberate skew: it makes the input optional, so
  // a required-with-default field re-walks as optional.
  it("emits formats and defaults, and the emitted source walks back", async () => {
    const ir = {
      kind: "object" as const,
      optional: false,
      nullable: false,
      fields: [
        {
          name: "email",
          label: "Email",
          spec: {
            kind: "string" as const,
            format: "email" as const,
            optional: false,
            nullable: false,
          },
        },
        {
          name: "severity",
          label: "Severity",
          spec: {
            kind: "enum" as const,
            options: ["low", "high"],
            optional: false,
            nullable: false,
            defaultValue: "low",
          },
        },
      ],
    };
    const source = emitZodSchema(ir, "fidelitySchema");
    expect(source).toContain("email: z.email(),");
    expect(source).toContain('severity: z.enum(["low", "high"]).default("low"),');

    const dir = freshTmpDir("roundtrip-fidelity");
    const file = path.join(dir, "fidelitySchema.ts");
    fs.writeFileSync(file, source, "utf8");
    const jiti = createJiti(import.meta.url);
    const mod = (await jiti.import(pathToFileURL(file).href)) as Readonly<
      Record<string, unknown>
    >;
    const walked = fromZod(mod["fidelitySchema"]);
    if (walked.kind !== "object") throw new Error("expected object root");
    expect(walked.fields[0]?.spec).toEqual({
      kind: "string",
      format: "email",
      optional: false,
      nullable: false,
    });
    expect(walked.fields[1]?.spec).toEqual({
      kind: "enum",
      options: ["low", "high"],
      // .default() makes the input optional — the deliberate skew above.
      optional: true,
      nullable: false,
      defaultValue: "low",
    });
  });
});
