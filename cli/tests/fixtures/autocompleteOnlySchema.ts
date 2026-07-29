import { z } from "zod";

// The autocomplete-ONLY fixture: every leaf is a string carrying the
// config-fields autocomplete override, so no kind's DEFAULT control (and
// none of its imports) is ever emitted. This is the exact gap the
// module-layout import gates missed — with a non-overridden string in the
// schema (like overridesSchema's `notes`), usage.string keeps pulling
// ChangeEvent/Typography in and hides an ungated usage.autocomplete.
export const autocompleteOnlySchema = z.object({
  origin: z.string(),
  destination: z.string(),
});
