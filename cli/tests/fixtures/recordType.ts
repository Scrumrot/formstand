// Two type-mode shapes that used to vanish or lie instead of degrading:
// a function-typed member was dropped without a trace (the generated schema
// silently lost a key of the type it mirrors), and an index-signature-only
// object walked to an EMPTY object (an empty section, z.object({}) in the
// emitted schema). Both now become the string-plus-TODO placeholder every
// other unsupported shape gets.
export type WithRecord = {
  name: string;
  scores: Record<string, number>;
  onChange: (value: string) => void;
  labels?: { [key: string]: string };
};
