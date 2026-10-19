import { z } from "zod";

// Field names that differ only in case: distinct TypeScript identifiers,
// but the module layout turns each into a FILE, and Windows and macOS
// file systems are case-insensitive, so EmailField.tsx and EMailField.tsx
// are one file there (the second write clobbers the first). The planner
// must dedupe file-bearing names case-insensitively.
export const caseCollisionSchema = z.object({
  email: z.string(),
  eMail: z.string(),
  userID: z.string(),
  userId: z.string(),
  address: z.object({ city: z.string() }),
  Address: z.object({ zip: z.string() }),
});
