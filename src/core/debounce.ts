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
  const cancel = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const schedule = (run: () => void): void => {
    cancel();
    if (ms === 0) {
      run();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      run();
    }, ms);
  };
  return Object.freeze({
    schedule,
    cancel,
    pending: () => timer.current !== null,
  });
};
