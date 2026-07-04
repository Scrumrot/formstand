import { z } from "zod";

// Default-export fixture for `--export default`. The file's base name is the
// fallback local identifier, so the generated component reads
// `import schema from "./schema"`.
export default z.object({
  title: z.string(),
  done: z.boolean(),
});
