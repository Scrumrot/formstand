# Multi-step forms

This page covers `useFormSteps`: one form and one schema behind a wizard, per-step validation gating, what `next`/`back`/`goTo` each promise, the per-step status for progress UIs, and where cross-step rules surface.

## One form, stepped

A wizard is one form whose fields *render* in stages — not several forms stitched together. Keep the whole schema and all initial values on a single `useForm`, and let `useFormSteps` gate navigation:

```tsx
import { useForm, useFormSteps, TextField, CheckboxField } from "formstand";

const schema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirm: z.string(),
    city: z.string().min(1),
    agree: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm) {
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "passwords must match" });
    }
  });

const STEPS = [
  { name: "account", fields: ["email", "password", "confirm"] },
  { name: "shipping", fields: ["city"] },
  { name: "review", fields: ["agree"] },
] as const;

const Wizard = () => {
  const form = useForm(schema, { initialValues });
  const wizard = useFormSteps(form, STEPS);

  return (
    <form onSubmit={form.handleSubmit(onValid)}>
      {wizard.step === 0 && (
        <>
          <TextField form={form} path="email" label="Email" />
          {/* ... */}
        </>
      )}
      {wizard.step === 1 && <TextField form={form} path="city" label="City" />}
      {wizard.step === 2 && <CheckboxField form={form} path="agree" label="I agree" />}

      {!wizard.isFirst && <button type="button" onClick={wizard.back}>Back</button>}
      {wizard.isLast
        ? <button type="submit">Submit</button>
        : <button type="button" onClick={() => void wizard.next()}>Next</button>}
    </form>
  );
};
```

Each step declares the paths it owns; a container path covers its whole subtree, so `fields: ["shipping"]` owns `shipping.city` and everything beside it.

## What the navigation promises

- **`next()`** validates the current step's fields (through `validateFieldsAsync`, so async refines are covered) and advances only when they come back clean. A failed advance writes the step's errors and **marks the errored fields touched**, exactly like a failed submit, so touched-gated error UIs show why the wizard refused. On the last step it validates without advancing — submit is the last step's "next" — and still resolves whether the step was clean, so `if (await wizard.next())` reads the same everywhere.
- **`back()`** never validates. Leaving a half-filled step backward is normal.
- **`goTo(target)`** is free going backward. Going **forward** it validates every step from the current one up to (not including) the target and lands on the first one that fails, errors visible — so a clickable step header can be a plain `goTo()` without letting anyone skip past an invalid step. It resolves the index actually landed on.

The step index is deliberately React state, not form state: it is UI navigation, not form data. Lift the returned value like any component state if a progress bar lives elsewhere, or use the bound `use{Name}Steps` from [`createFormHooks`](./state#pre-wired-hooks-createformhooks).

## Progress UIs

`wizard.steps` is index-aligned live status: `name`, `visited` (the first step starts visited), and `hasErrors` — any error currently at or under the step's fields, kept live so a step the user broke *after* leaving it can be flagged:

```tsx
{wizard.steps.map((s, i) => (
  <button key={i} type="button" onClick={() => void wizard.goTo(i)}>
    {s.name} {s.hasErrors ? "!" : s.visited ? "✓" : ""}
  </button>
))}
```

## Validation scoping, honestly

`next()` parses the **whole schema** and scopes the resulting errors to the step's paths. That means a cross-field refine *inside* a step (the `confirm` check above, issued at a path the step owns) gates the advance. A rule whose issue lands at the root `""` key — or at a path a *different* step owns — does not: a step only re-judges its own paths. Cross-step rules surface at submit, which is where every wizard ultimately reconciles, and the final step's submit button goes through the ordinary [`handleSubmit`](./validation) (or the [form-actions bridge](./ssr#react-19-form-actions)).

Values entered on other steps are still validated on submit even if the user never revisits them — one schema, one values object, nothing is partial.

## Next

- [Validation](./validation): the passes `next()` composes over.
- [Form state & lifecycle](./state): `useIsDirty(path)` and friends for per-step dirty chips.
