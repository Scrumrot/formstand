import { z } from "zod";

// A zod schema exported under a string-literal module name (ES2022
// arbitrary module namespace identifiers). It cannot be imported as a bare
// identifier, so the CLI must refuse it with the rule rather than emit
// `import { my schema } from ...`.
const inner = z.object({ name: z.string() });

export { inner as "my schema" };
