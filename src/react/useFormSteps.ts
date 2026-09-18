import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type {
  DefaultPathDepth,
  FieldPath,
  PathDepth,
} from "../core/fieldPath";
import { isPathOrChild } from "../core/validation";
import { useFormSelectorShallow } from "./useFormSelector";

// The multi-step (wizard) story: one form, one schema, one values object —
// and a step index that gates progress on the CURRENT step's fields
// validating clean. Everything else falls out of what the library already
// does: next() runs validateFieldsAsync over the step's paths (the full
// schema parses, so cross-field refines inside a step fire; the errors are
// scoped to the step), a failed advance marks the errored fields touched
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
  // step validated clean, so `if (await steps.next())` reads naturally on
  // any step, the last included.
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
  // refused.
  const validateStep = useCallback(
    async (index: number): Promise<boolean> => {
      const definition = latest.current[index];
      if (definition === undefined) return true;
      const result = await form.validateFieldsAsync(definition.fields);
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

  const next = useCallback(async (): Promise<boolean> => {
    // Functional reads through state setters would race the async
    // validation; the render-time `step` is the one the user acted on.
    const ok = await validateStep(step);
    if (!ok) return false;
    const target = Math.min(step + 1, latest.current.length - 1);
    setStep(target);
    setVisited((prev) => new Set([...prev, target]));
    return true;
  }, [validateStep, step]);

  const back = useCallback((): void => {
    setStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const goTo = useCallback(
    async (target: number): Promise<number> => {
      const count = latest.current.length;
      const clamped = Math.max(0, Math.min(target, count - 1));
      if (clamped <= step) {
        setStep(clamped);
        return clamped;
      }
      // Walk forward, validating each step on the way; land on the first
      // failure so its errors are on screen.
      const walk = async (from: number): Promise<number> => {
        if (from >= clamped) return clamped;
        return (await validateStep(from)) ? walk(from + 1) : from;
      };
      const landed = await walk(step);
      setStep(landed);
      setVisited(
        (prev) =>
          new Set([
            ...prev,
            ...Array.from({ length: landed - step + 1 }, (_, i) => step + i),
          ]),
      );
      return landed;
    },
    [validateStep, step],
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
