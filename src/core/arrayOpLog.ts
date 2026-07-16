// A per-store, per-path log of recent array ops, recorded by the core's
// applyArrayOp and replayed by useFieldArray's row-id derivation. The ops
// carry the EXACT new→old index mapping, so id derivation never has to
// guess which of two Object.is-equal rows an op removed or moved — the one
// case value-based reconciliation cannot decide. A sanctioned mutable-ref
// cache (like the core's subschemaCache): the log is derived bookkeeping,
// never part of form state, and the WeakMap releases it with the store.

export type ArrayOpRecord = Readonly<{
  // The array value the op consumed / produced — reference identity is the
  // chain link: a consumer replays from the record whose `from` matches its
  // last-seen array, on through consecutive records, until it reaches the
  // live array (or gives up and falls back to value reconciliation).
  from: readonly unknown[];
  to: readonly unknown[];
  // newIndex → oldIndex; -1 marks a freshly created row.
  mapping: readonly number[];
}>;

// Bounded: a consumer more than OP_LOG_LIMIT ops behind (no render for 16
// array ops) falls back to value reconciliation — correctness degrades to
// the pre-log behavior, never breaks.
const OP_LOG_LIMIT = 16;

const logs = new WeakMap<object, Map<string, readonly ArrayOpRecord[]>>();

export const recordArrayOp = (
  store: object,
  path: string,
  record: ArrayOpRecord,
): void => {
  const byPath = logs.get(store) ?? new Map<string, readonly ArrayOpRecord[]>();
  logs.set(store, byPath);
  const appended = [...(byPath.get(path) ?? []), record];
  byPath.set(path, appended.slice(-OP_LOG_LIMIT));
};

export const arrayOpsFor = (
  store: object,
  path: string,
): readonly ArrayOpRecord[] => logs.get(store)?.get(path) ?? [];
