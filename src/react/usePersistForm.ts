import { useEffect, useMemo, useRef } from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type { DefaultPathDepth, PathDepth } from "../core/fieldPath";
import {
  type PersistHandle,
  type PersistOptions,
  persistForm,
} from "../core/persist";

// The React lifecycle wrapper persistForm was missing: every useForm
// consumer hand-wrote the mount/dispose effect (plus a ref to reach
// clear() after submit), and calling persistForm during render
// double-subscribed under StrictMode. This hook owns that dance:
//
//   const form = useForm(schema, { initialValues });
//   const draft = usePersistForm(form, { key: "profile-draft" });
//   // ... later: draft.clear() after a successful submit.
//
// The returned handle is REFERENCE-STABLE across renders and delegates to
// whichever inner subscription is currently live, so it is safe to close
// over in submit handlers. Before the mount effect has run (and after
// unmount) load() reads false and clear() is a no-op — the same
// guarded no-throw posture persistForm itself has.
//
// Options are read when the subscription (re)starts — on mount, and again
// if `form` or `options.key` changes — not on every render, mirroring
// useForm's locked-options rule; pass a stable options object or accept
// that later edits to it are ignored until the key or form changes.
export const usePersistForm = <
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  options: PersistOptions<TSchema>,
): PersistHandle => {
  const inner = useRef<PersistHandle | null>(null);
  const latestOptions = useRef(options);
  // An effect, not a render-time ref write (refs are off-limits during
  // render): it runs before the subscription effect below in the same
  // commit, so a resubscribe always reads the options of the render that
  // triggered it.
  useEffect(() => {
    latestOptions.current = options;
  });

  const key = options.key;
  useEffect(() => {
    const handle = persistForm(form, latestOptions.current);
    inner.current = handle;
    return () => {
      inner.current = null;
      handle.dispose();
    };
    // StrictMode's mount-cleanup-mount runs this twice: each pass gets its
    // own subscription and disposes the previous, so no double-writes.
  }, [form, key]);

  return useMemo(
    () => ({
      load: () => inner.current?.load() ?? false,
      clear: () => inner.current?.clear(),
      // dispose stops THIS component's watching early; the effect cleanup
      // still runs its own dispose harmlessly (persistForm's dispose is
      // idempotent by construction — it only cancels and unsubscribes).
      dispose: () => inner.current?.dispose(),
    }),
    [],
  );
};
