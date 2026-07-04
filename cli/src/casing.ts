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

export const pascalCase = (name: string): string =>
  splitWords(name).map(capitalize).join("");

export const camelCase = (name: string): string => {
  const pascal = pascalCase(name);
  return pascal.length === 0
    ? pascal
    : pascal.charAt(0).toLowerCase() + pascal.slice(1);
};
