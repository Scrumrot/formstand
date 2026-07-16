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

// Bounded two ways, both loss-limited: a path's record COUNT is capped by
// COMPOSING its two oldest records into one when consecutive (op mappings
// compose, so an arbitrarily long run of consecutive ops stays fully
// replayable in OP_LOG_LIMIT records; only a chain already broken by an
// external write drops its dead head) — and a store accumulating more than
// MAX_LOG_PATHS distinct array paths (dynamic row paths on a long-lived
// singleton form) evicts its oldest path's records, degrading that path to
// value reconciliation.
const OP_LOG_LIMIT = 16;
const MAX_LOG_PATHS = 256;

// (second ∘ first): newIndex → the FIRST record's old index. A -1 anywhere
// along the way stays -1 (the row was created inside the composed span).
const composeOps = (
  first: ArrayOpRecord,
  second: ArrayOpRecord,
): ArrayOpRecord => ({
  from: first.from,
  to: second.to,
  mapping: second.mapping.map((mid) =>
    mid === -1 ? -1 : (first.mapping[mid] ?? -1),
  ),
});

const logs = new WeakMap<object, Map<string, readonly ArrayOpRecord[]>>();

// Cap a path's record count, composing the two oldest records when they are
// consecutive (lossless) and dropping the dead head otherwise. The slice
// work only happens on overflow — the common case appends untouched.
const boundOps = (
  ops: readonly ArrayOpRecord[],
): readonly ArrayOpRecord[] => {
  const [head, second] = ops;
  if (ops.length <= OP_LOG_LIMIT || head === undefined || second === undefined) {
    return ops;
  }
  return head.to === second.from
    ? [composeOps(head, second), ...ops.slice(2)]
    : ops.slice(1);
};

export const recordArrayOp = (
  store: object,
  path: string,
  record: ArrayOpRecord,
): void => {
  const existing = logs.get(store);
  const byPath = existing ?? new Map<string, readonly ArrayOpRecord[]>();
  if (existing === undefined) logs.set(store, byPath);
  const bounded = boundOps([...(byPath.get(path) ?? []), record]);
  byPath.delete(path);
  byPath.set(path, bounded);
  if (byPath.size > MAX_LOG_PATHS) {
    const oldest = byPath.keys().next().value;
    if (oldest !== undefined) byPath.delete(oldest);
  }
};

export const arrayOpsFor = (
  store: object,
  path: string,
): readonly ArrayOpRecord[] => logs.get(store)?.get(path) ?? [];

// Drop a path's records — called by the consumer after a walk consumed them
// (the log is per-batch bookkeeping, spent once derived).
export const clearArrayOps = (store: object, path: string): void => {
  logs.get(store)?.delete(path);
};

// Drop the records of the written path and its DESCENDANTS — the paths
// where a value write can reintroduce a previously-seen array reference
// (the caller supplies the subtree's values; reset/restore reinstate stored
// ones; an array op re-seats existing descendant arrays under new indices),
// which stale records could falsely chain against. Ancestor paths are
// deliberately KEPT: setAtPath always builds fresh spine arrays, so an
// ancestor reference can never recur — and an ancestor's earlier records
// are real history the id walk still replays, bridging the gap this write
// created. "" (whole-values writes) clears all. `keepSelf` is for
// applyArrayOp itself: the op's own path is exactly what it is about to
// record, and its earlier same-batch records still chain.
export const clearArrayOpsUnder = (
  store: object,
  path: string,
  keepSelf = false,
): void => {
  const byPath = logs.get(store);
  if (byPath === undefined) return;
  if (path === "") {
    byPath.clear();
    return;
  }
  const related = [...byPath.keys()].filter(
    (p) => (p === path && !keepSelf) || p.startsWith(`${path}.`),
  );
  related.forEach((p) => byPath.delete(p));
};
