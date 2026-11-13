import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type {
  DefaultPathDepth,
  FieldPath,
  PathDepth,
} from "../core/fieldPath";
import {
  type SettledFieldsValidationResult,
  isPathOrChild,
} from "../core/validation";
import { useFormSelectorShallow } from "./useFormSelector";

// The multi-step (wizard) story: one form, one schema, one values object —
// and a step index that gates progress on the CURRENT step's fields
// validating clean. Everything else falls out of what the library already
// does: next() runs validateFieldsAsync over the step's paths (just those
// slots when every path extracts a subschema; a refine on an ancestor
// object sends the batch through the full parse, so cross-field rules
// inside a step still fire; either way the errors are scoped to the
// step), a failed advance marks the errored fields touched
// exactly the way a failed submit does (so touched-gated error UIs show),
// and going BACK never validates — leaving a half-filled step is normal.
//
// The step index is deliberately React state, not form state: it is UI
// navigation, not form data, and FormState's shape is owned by the
// library. Render a progress bar elsewhere by lifting the returned value,
// exactly as you would any other component state.
//
// Cross-STEP rules (a schema-level refine over fields in different steps)
// surface at submit, like every wizard: a step only re-judges its own
// paths, and the root "" key belongs to the whole form.

export type FormStep<TValues, D extends PathDepth = DefaultPathDepth> = Readonly<{
  // For progress UIs; steps are addressed by index either way.
  name?: string;
  // The paths this step owns — a container path covers its whole subtree.
  fields: readonly FieldPath<TValues, D>[];
}>;

export type StepStatus = Readonly<{
  name: string | undefined;
  // The user has been ON this step (the first step starts visited).
  visited: boolean;
  // Any error currently at or under the step's fields — live, so a
  // progress bar can flag a step the user broke after leaving it.
  hasErrors: boolean;
}>;

export type UseFormStepsReturn = Readonly<{
  step: number;
  name: string | undefined;
  count: number;
  isFirst: boolean;
  isLast: boolean;
  // Validate the current step; on clean, advance (no-op advance on the
  // last step — submit is the last step's "next"). Resolves whether the
  // step validated clean AND the advance applied, so `if (await
  // steps.next())` reads naturally on any step, the last included; a
  // user who navigated elsewhere while the pass was in flight keeps their
  // newer position and the call resolves false.
  next: () => Promise<boolean>;
  // Never validates: leaving a half-filled step backward is normal.
  back: () => void;
  // Backward jumps are free. A forward jump validates each step from the
  // current one up to (not including) the target and LANDS ON THE FIRST
  // ONE THAT FAILS, errors visible — so a step header can be a plain
  // goTo() without letting anyone skip past an invalid step. Resolves the
  // index actually landed on.
  goTo: (target: number) => Promise<number>;
  // Per-step live status, index-aligned with the definitions.
  steps: readonly StepStatus[];
}>;

// A step's verdict for the values it holds NOW. validateFieldsAsync's
// verdict describes the values the pass started with: the core refuses to
// commit a stale one but still resolves it, so a step whose value changed
// while an async rule was in flight used to advance on the old value. A
// changed step re-runs on the live values; a few rounds cover a user still
// typing, past that (null) the advance refuses.
const settleOnLiveValues = async <
  TSchema extends z.ZodType,
  D extends PathDepth,
>(
  form: Form<TSchema, D>,
  fields: readonly FieldPath<z.input<TSchema>, D>[],
  round = 0,
): Promise<SettledFieldsValidationResult | null> => {
  const before = fields.map((path) => form.getField(path));
  const result = await form.validateFieldsAsync(fields);
  const changed = fields.some(
    (path, i) => !Object.is(form.getField(path), before[i]),
  );
  if (!changed) return result;
  return round < 3 ? settleOnLiveValues(form, fields, round + 1) : null;
};

export const useFormSteps = <
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  steps: readonly FormStep<z.input<TSchema>, D>[],
): UseFormStepsReturn => {
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<number>>(
    () => new Set([0]),
  );

  // Latest-ref so next/goTo/back are reference-stable however the caller
  // writes the steps array (the usePersistForm pattern; navigation only
  // fires after mount, so the ref is always populated). The COUNT should
  // stay stable for sensible UX, but nothing here breaks if it doesn't —
  // there are no per-step hooks.
  const latest = useRef(steps);
  useEffect(() => {
    latest.current = steps;
  });

  // Validate one step's paths and mirror submit's convention on failure:
  // the errored keys (already scoped to the step by validateFieldsAsync)
  // are marked touched, so touched-gated error UIs show why the advance
  // refused. The pass is judged on the step's live values (see
  // settleOnLiveValues).
  const validateStep = useCallback(
    async (index: number): Promise<boolean> => {
      const definition = latest.current[index];
      if (definition === undefined) return true;
      const result = await settleOnLiveValues(form, definition.fields);
      if (result === null) return false;
      if (result.kind === "invalid") {
        Object.keys(result.errors).forEach((key) => {
          form.setTouched(key as FieldPath<z.input<TSchema>, D>, true);
        });
        return false;
      }
      return true;
    },
    [form],
  );

  // The step the user is on RIGHT NOW: a ref every navigation writes
  // synchronously, which next() and goTo() read when they start and again
  // after their await. The render-time `step` lagged twice over: a closure
  // held the step of the render it came from, so two awaited next() calls
  // from one handler validated the same step twice (both resolved true,
  // the wizard moved once), and the guard ref used to move in an effect, a
  // commit late. State mirrors the ref for rendering. The user may press
  // back() while a validation is in flight; applying the advance then
  // would land two steps past where they now are, so each transition
  // re-checks that the step is still the one it validated before writing,
  // and otherwise leaves the user's newer navigation alone.
  const currentStep = useRef(step);
  const navigate = useCallback((target: number): void => {
    currentStep.current = target;
    setStep(target);
  }, []);

  const next = useCallback(async (): Promise<boolean> => {
    const from = currentStep.current;
    const ok = await validateStep(from);
    if (!ok) return false;
    if (currentStep.current !== from) return false;
    // Clamped at 0 as well: with no steps defined the last index is -1.
    const target = Math.max(0, Math.min(from + 1, latest.current.length - 1));
    navigate(target);
    setVisited((prev) => new Set([...prev, target]));
    return true;
  }, [validateStep, navigate]);

  const back = useCallback((): void => {
    navigate(Math.max(currentStep.current - 1, 0));
  }, [navigate]);

  const goTo = useCallback(
    async (target: number): Promise<number> => {
      const count = latest.current.length;
      // A NaN target (Number("") from an empty <select> option) passed
      // through the clamp as NaN, and the forward walk's `from >= NaN`
      // never held, so it recursed without bound. A target that is not a
      // finite number is a no-op that resolves where the form is.
      if (!Number.isFinite(target)) return currentStep.current;
      const from = currentStep.current;
      const clamped = Math.max(0, Math.min(Math.trunc(target), count - 1));
      if (clamped <= from) {
        navigate(clamped);
        return clamped;
      }
      // Walk forward, validating each step on the way; land on the first
      // failure so its errors are on screen.
      const walk = async (at: number): Promise<number> => {
        if (at >= clamped) return clamped;
        return (await validateStep(at)) ? walk(at + 1) : at;
      };
      const landed = await walk(from);
      // The user navigated during the walk (back(), or another goTo that
      // resolved first): their newer position wins, and the caller learns
      // where the form actually is.
      if (currentStep.current !== from) return currentStep.current;
      navigate(landed);
      setVisited(
        (prev) =>
          new Set([
            ...prev,
            ...Array.from({ length: landed - from + 1 }, (_, i) => from + i),
          ]),
      );
      return landed;
    },
    [validateStep, navigate],
  );

  // Live per-step error presence, shallow-compared so renders happen only
  // when some step's flag flips — not on every error-map write.
  const errorFlags = useFormSelectorShallow(form, (state) =>
    steps.map((definition) =>
      definition.fields.some((path) =>
        Object.keys(state.errors).some((key) => isPathOrChild(key, path)),
      ),
    ),
  );

  const statuses = useMemo(
    () =>
      steps.map(
        (definition, index): StepStatus => ({
          name: definition.name,
          visited: visited.has(index),
          hasErrors: errorFlags[index] ?? false,
        }),
      ),
    [steps, visited, errorFlags],
  );

  return useMemo(
    () => ({
      step,
      name: steps[step]?.name,
      count: steps.length,
      isFirst: step === 0,
      isLast: step === steps.length - 1,
      next,
      back,
      goTo,
      steps: statuses,
    }),
    [step, steps, next, back, goTo, statuses],
  );
};
