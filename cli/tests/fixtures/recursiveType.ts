// Type-mode shapes the walker used to expand to the depth budget instead
// of cutting off: a self-referential type (every level re-entered the same
// declared type until the budget ran out, thousands of IR nodes for a
// three-member tree), and the global `Function` type, whose interface has
// no call signature of its own, so the callable check missed it and the
// walk descended into Function.prototype (apply/call/bind/caller).
export type Tree = {
  value: string;
  left?: Tree;
  right?: Tree;
};

export type WithFunction = {
  name: string;
  // The bare global type IS the shape under test (the lint rule is right
  // for application code; here it would remove the case).
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  fn: Function;
  handler: () => void;
};

// Mutual recursion through an array: Folder -> Entry[] -> Folder.
export type Entry = {
  title: string;
  folder?: Folder;
};

export type Folder = {
  name: string;
  entries: Entry[];
};
