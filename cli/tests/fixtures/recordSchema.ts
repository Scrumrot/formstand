import { z } from "zod";

// A degraded leaf next to a healthy one: z.record has no fixed keys to bind,
// so the walker stands it in as a string with a TODO. Everything that must
// stay honest around a stand-in is pinned off this fixture: the module
// layout's field file still typechecks, the CLI mirrors the TODO on stderr,
// and the generated spec skips its round trip (a string is not a record).
export const recordSchema = z.object({
  name: z.string(),
  meta: z.record(z.string(), z.string()),
});
