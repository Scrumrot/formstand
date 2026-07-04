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
});
