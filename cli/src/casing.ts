// The one word-splitting rule every casing helper (and labelFromName) shares:
// camelCase boundaries, acronym boundaries (APIKey → API | Key), and any run
// of non-alphanumeric characters as a separator.

export const capitalize = (word: string): string =>
  word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);

export const splitWords = (name: string): readonly string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0);

// Identifiers can't start with a digit, but schema keys can ("2fa",
// "2ndOwners"). Every pascalCase/camelCase result becomes a declared
// identifier somewhere (const/type/component names), so digit-leading
// results get an underscore prefix here, once, instead of at every
// emission site. Labels are unaffected: labelFromName uses splitWords
// directly.
const identSafe = (name: string): string =>
  /^[0-9]/.test(name) ? `_${name}` : name;

export const pascalCase = (name: string): string =>
  identSafe(splitWords(name).map(capitalize).join(""));

export const camelCase = (name: string): string => {
  const pascal = splitWords(name).map(capitalize).join("");
  return identSafe(
    pascal.length === 0
      ? pascal
      : pascal.charAt(0).toLowerCase() + pascal.slice(1),
  );
};

// Reserved words a bare camelCase(fieldName) could collide with when used
// as a const binding (row variables in the module layout). PascalCase
// outputs can't collide — reserved words are lowercase.
const RESERVED = new Set([
  "await", "break", "case", "catch", "class", "const", "continue",
  "debugger", "default", "delete", "do", "else", "enum", "export",
  "extends", "false", "finally", "for", "function", "if", "implements",
  "import", "in", "instanceof", "interface", "let", "new", "null",
  "package", "private", "protected", "public", "return", "static",
  "super", "switch", "this", "throw", "true", "try", "typeof", "var",
  "void", "while", "with", "yield",
]);

// A camelCase result that is safe to DECLARE (`const new` is a syntax
// error; `const new_` is not).
export const camelIdent = (name: string): string => {
  const base = camelCase(name);
  return RESERVED.has(base) ? `${base}_` : base;
};

export const isReservedWord = (name: string): boolean => RESERVED.has(name);

// "References" → "Reference", for the array add-button copy ("Add
// reference" reads as the action it performs; "Add references" reads like
// a bulk import). A heuristic, deliberately conservative: the common
// English plural spellings reverse cleanly, irregulars (children, people)
// and anything it cannot classify pass through unchanged — a plural
// surviving is copy polish lost, a mangled singular would be a bug. Only
// the LAST word changes ("Job Openings" → "Job Opening").
export const singularize = (label: string): string => {
  const words = label.split(" ");
  const last = words[words.length - 1] ?? "";
  const lower = last.toLowerCase();
  const singularLast = ((): string => {
    // -us/-is words (status, campus, analysis, axis) are singulars that
    // happen to end in s.
    if (
      lower.length <= 3 ||
      !lower.endsWith("s") ||
      lower.endsWith("ss") ||
      lower.endsWith("us") ||
      lower.endsWith("is")
    ) {
      return last;
    }
    if (lower.endsWith("ies")) return `${last.slice(0, -3)}y`;
    // boxes/batches/addresses; the stem check keeps "notes"/"phones" on
    // the plain strip-the-s path below.
    if (
      lower.endsWith("es") &&
      /(?:s|x|z|ch|sh)$/.test(lower.slice(0, -2))
    ) {
      return last.slice(0, -2);
    }
    return last.slice(0, -1);
  })();
  return [...words.slice(0, -1), singularLast].join(" ");
};
