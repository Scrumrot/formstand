// A trailing-edge debouncer: `schedule` replaces any pending call, `cancel`
// drops it. One production for the two timers the library keeps (the
// persistence draft writer and useField's async-validation debounce), so
// the cancel-then-reschedule rule lives in one place. Deliberately NOT a
// `debounce(fn)` wrapper: both callers close over per-call data (the values
// to write, the value that scheduled a validation) and decide at fire time,
// so the scheduled thunk is the unit, not a fixed function.
export type Debouncer = Readonly<{
  schedule: (run: () => void) => void;
  cancel: () => void;
  // Run the pending thunk NOW instead of waiting out the delay (a no-op
  // when nothing is pending): persistForm's dispose and flush, where the
  // moment cannot wait.
  flush: () => void;
  // True while a scheduled run has not fired or been cancelled.
  readonly pending: () => boolean;
}>;

// A delay of 0 runs synchronously — the callers treat 0 as "no debounce"
// and the caller-visible ordering (write happens before schedule returns)
// is part of their contract.
export const createDebouncer = (ms: number): Debouncer => {
  // Sanctioned mutable ref for the timer handle (same shape as the
  // codebase's other timer/subscription refs).
  const timer: { current: ReturnType<typeof setTimeout> | null } = {
    current: null,
  };
  // The thunk the timer will run, kept so flush can run it early.
  const scheduled: { current: (() => void) | null } = { current: null };
  const cancel = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    scheduled.current = null;
  };
  const schedule = (run: () => void): void => {
    cancel();
    if (ms === 0) {
      run();
      return;
    }
    scheduled.current = run;
    timer.current = setTimeout(() => {
      timer.current = null;
      scheduled.current = null;
      run();
    }, ms);
  };
  const flush = (): void => {
    const run = scheduled.current;
    if (run === null) return;
    cancel();
    run();
  };
  return Object.freeze({
    schedule,
    cancel,
    flush,
    pending: () => timer.current !== null,
  });
};
