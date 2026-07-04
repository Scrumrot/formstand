// Reproduces the Array.prototype leak: a tuple is not `isArrayType`, so the
// type walker used to fall into the object branch and emit push/pop/length as
// form fields. Also carries a method (skipped — a property whose type has
// call signatures is not a form field) and an array of callables (the element
// type itself is callable, so the element degrades to a todo).
export type WithTuple = {
  name: string;
  pair: [string, number];
  greet: (who: string) => string;
  callables: { (x: number): number; description: string }[];
};
