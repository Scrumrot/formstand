import type { z } from "zod";
import type { Form, SubmitResult } from "../core/createForm";
import type {
  DefaultPathDepth,
  FieldPath,
  FieldValue,
  PathDepth,
} from "../core/fieldPath";
import { shouldValidateOn } from "../core/mode";

// formstand/testing: drive a form in tests the way the HOOKS drive it —
// mode-gated validation included — without mounting components. Tests
// that call form.setValue directly get the imperative, validation-silent
// write (correct for the imperative API, wrong for simulating a user),
// and re-deriving the change/blur gates by hand is exactly the kind of
// mode-semantics knowledge a test should not have to carry. These
// helpers restate useField's own recipes over the core API, so a test
// exercises the same validation flow a rendered input would, at store
// speed. They are framework-agnostic on purpose: they return plain data
// and write plain state; your test runner's assertions do the judging.

// A user edit: write the value, then validate under the CHANGE gate —
// exactly useField's setValue, including the no-op guard (writing the
// identical value leaves state untouched, so the gate is skipped too).
export const fillField = <
  TSchema extends z.ZodType,
  P extends FieldPath<z.input<TSchema>, D>,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  path: P,
  value: FieldValue<z.input<TSchema>, P>,
): void => {
  const before = form.store.getState();
  form.setValue(path, value);
  const state = form.store.getState();
  if (state === before) return;
  if (
    shouldValidateOn(
      "change",
      state.mode,
      state.reValidateMode,
      state.submitCount > 0,
      state.touched[path] ?? false,
    )
  ) {
    form.validateField(path);
  }
};

// A user leaving the field: mark it touched, then validate under the
// BLUR gate — exactly useField's onBlur.
export const blurField = <
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  path: FieldPath<z.input<TSchema>, D>,
): void => {
  form.setTouched(path, true);
  const state = form.store.getState();
  if (
    shouldValidateOn(
      "blur",
      state.mode,
      state.reValidateMode,
      state.submitCount > 0,
      true,
    )
  ) {
    form.validateField(path);
  }
};

// Edit-then-leave, the way a user fills a form field. The common case in
// a test that wants touched-gated error UIs to show what they would show.
export const fillAndBlurField = <
  TSchema extends z.ZodType,
  P extends FieldPath<z.input<TSchema>, D>,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  path: P,
  value: FieldValue<z.input<TSchema>, P>,
): void => {
  fillField(form, path, value);
  blurField(form, path);
};

// Fill several fields in one call — entries are applied in order, each
// through the full fillField recipe. The object shape is deliberately
// runtime-keyed (a test's fixture data), so values are checked per key
// where the paths are literal and degrade to unknown otherwise.
export const fillFields = <
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
  values: Readonly<
    Partial<Record<FieldPath<z.input<TSchema>, D>, unknown>>
  >,
): void => {
  Object.entries(values).forEach(([path, value]) => {
    fillField(
      form,
      path as FieldPath<z.input<TSchema>, D>,
      value as never,
    );
  });
};

// Submit with a no-op handler and hand back the SubmitResult: "valid"
// carries the parsed z.output data, "invalid" the ErrorMap (written to
// the store and marked touched, like any failed submit), "error" cannot
// occur (the handler cannot throw), and "skipped" means a submit was
// already in flight. Await it and switch — the discriminant does the
// asserting-shape work.
export const submitForm = <
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(
  form: Form<TSchema, D>,
): Promise<SubmitResult<z.output<TSchema>>> => form.submit(() => undefined);
