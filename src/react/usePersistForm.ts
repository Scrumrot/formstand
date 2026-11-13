import { useEffect, useMemo, useRef } from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type { DefaultPathDepth, PathDepth } from "../core/fieldPath";
import {
  type PersistHandle,
  type PersistOptions,
  type PersistStorage,
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
// that later edits to it are ignored until the key or form changes. The
// one exception is `storage`: every call goes to the storage of the
// LATEST render through a proxy, so a swap (session to local, a per-user
// namespace) takes effect on the next touch without a resubscribe. With
// storage in the effect deps instead, an inline storage literal
// resubscribed on every render, and the outgoing subscription's dispose()
// flushed, which collapsed the debounce to nothing and re-read the draft
// each render.
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
  // Whether a storage is given at all still keys the subscription: the
  // proxy cannot stand in for persistForm's default (localStorage), so
  // switching between "a storage" and "the default" resubscribes.
  const hasStorage = options.storage !== undefined;
  const storageProxy = useMemo<PersistStorage>(
    () => ({
      getItem: (k) => latestOptions.current.storage?.getItem(k) ?? null,
      setItem: (k, v) => latestOptions.current.storage?.setItem(k, v),
      removeItem: (k) => latestOptions.current.storage?.removeItem(k),
    }),
    [],
  );
  useEffect(() => {
    const options = latestOptions.current;
    const handle = persistForm(form, {
      ...options,
      ...(options.storage === undefined ? {} : { storage: storageProxy }),
    });
    inner.current = handle;
    return () => {
      inner.current = null;
      handle.dispose();
    };
    // StrictMode's mount-cleanup-mount runs this twice: each pass gets its
    // own subscription and disposes the previous, so no double-writes.
  }, [form, key, hasStorage, storageProxy]);

  return useMemo(
    () => ({
      load: () => inner.current?.load() ?? false,
      flush: () => inner.current?.flush(),
      clear: () => inner.current?.clear(),
      // dispose stops THIS component's watching early; the effect cleanup
      // still runs its own dispose harmlessly (persistForm's dispose is
      // idempotent by construction — it only cancels and unsubscribes).
      dispose: () => inner.current?.dispose(),
    }),
    [],
  );
};
