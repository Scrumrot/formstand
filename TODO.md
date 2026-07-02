Critical — correctness bugs worth fixing first (items 1–7 DONE, 2026-07-02)

1. Dirty tracking is silently wrong for array ops and setValues (src/core/createForm.ts:636-664, :559). arrayPush/arrayRemove/etc. and setValues change values but never update the dirty map — so useIsDirty, diff(), and dirtyFields() all report "clean" after adding/removing rows. Recompute dirtiness
   against initialValues in applyArrayOp and setValues.
2. Sync validation throws on async schemas everywhere except validateOnMount (src/core/createForm.ts:476-486, src/core/validation.ts:46-48). Mode-driven blur/change validation only survives because the React layer catches and reroutes; direct validate()/validateField() calls throw. Worse, async detection
   regex-matches Zod's error message string — use e instanceof z.core.$ZodAsyncError instead, and route to the async variants inside core.
3. Field-level validation parses the whole schema (src/core/createForm.ts:238-254). Every keystroke re-runs every refinement in the form — including every async refinement (a username-availability check fires when you type in an unrelated field). Also, errors match by exact key, so
   validateField("address") misses errors keyed at "address.street". Match by path prefix and extract subschemas for plain object shapes.
4. Full-form validation wipes server errors (src/core/createForm.ts:210, 459). Any validation pass replaces the whole error map, destroying errors set via setError. A background validateAsync() resolving will silently clear a "username taken" server error. Namespace manual errors separately (RHF-style
   type: 'server').
5. Nested union errors are dropped (src/core/validation.ts:17-24). Zod v4's invalid_union issue nests real per-branch messages in issue.errors — flattenIssues never recurses, so users see one generic "Invalid input" instead of field-level messages.
6. SelectField goes uncontrolled when value is undefined (src/react/inputProps.ts:70) — triggers React's controlled/uncontrolled warning and the classic "looks selected but form state is still undefined" bug. Use value ?? "" plus a placeholder option.
7. Render-phase ref mutation in useFieldArray (src/react/useFieldArray.ts:135-141). The id reconciler writes refs during render — under concurrent React a discarded render still advances id state, causing key instability/remounts in exactly the reorder cases it's built to protect. Use the render-phase
   setState derived-state pattern, or mint ids in the store.

High — API gaps users will hit immediately (items 8–13 DONE, 2026-07-02)

8. Zero accessibility wiring in the bound field components (src/react/fields.tsx, inputProps.ts): no aria-invalid, no aria-describedby linking errors, no role="alert", no name attribute (breaks autofill/password managers). This is table stakes for a form library.
9. submit returns true for an invalid submission (createForm.ts:461) — true means "ran", false means "skipped". Nearly everyone will write if (await form.submit(...)) expecting validity. Return a discriminated result.
10. Failed submit doesn't mark fields touched — so a touched-gated error UI (which your own docs recommend) shows nothing after the canonical first invalid submit.
11. No focus management — no focus-first-error on submit, no ref forwarding on field components (trivial in React 19 — ref is a normal prop now).
12. Typed paths only cover reads — setValue, setError, validateField, array ops all take bare string/unknown. The FieldPath machinery exists; extend it to the write surface (with untyped escape hatches for dynamic paths).
13. FieldPath can't see inside optional objects (fieldPath.ts:12-18) — profile: z.object({...}).optional() makes "profile.name" a type error even though runtime handles it. Recurse on NonNullable<T[K]>.

Medium — robustness and polish (items 14–24 DONE, 2026-07-02)

14. Path edge cases (src/core/path.ts): numeric string keys on a z.record get converted to array indices (silently replacing the record with an array); keys containing . are unaddressable; a huge index can allocate gigabytes. Decide index-vs-key from the existing container.
15. reset(nextInitial) corrupts array-rooted schemas (spreading an array into {...}) and merges only shallowly; consider RHF-style keepErrors/keepTouched options and a resetField(path).
16. Array ops don't validate indices — arrayRemove(path, -1) grows the array and corrupts the error/touched maps.
17. Error-array identity churn — every validation pass builds fresh error arrays, so every errored field re-renders on each full validation even when messages are unchanged. Reuse previous references when contents are equal.
18. NumberField gaps: accepts Infinity (Number.isNaN guard should be Number.isFinite), turns whitespace into 0, and masks external value changes (reset/adoptValues) while focused. Also the accepted-but-ignored step prop.
19. useForm silently ignores schema/options changes forever — the #1 form-library footgun (late-arriving initialValues from a fetch do nothing). At minimum dev-warn and point at adoptValues.
20. useFormState name collides with React DOM's useFormState — auto-imports will grab the wrong one. Consider useFormSelector.
21. "__form__" sentinel lives in the shared isValidating map — a real field named __form__ collides. Promote to a proper isValidatingForm: boolean.
22. Stale src/react/index.ts barrel exports only 3 of ~15 public APIs — delete it or complete it.
23. useFieldArray mints a fresh [] for missing arrays in its selector, causing re-renders on every store change; hoist a constant empty array.
24. Smaller items: Date values never compare equal in valuesEqual (permanently-dirty date fields); clearErrors(path) doesn't clear child keys; setErrors replaces rather than merges; debounce timer not cleared when debounceMs changes; no "onTouched"/"all" validation modes; missing getFieldState/setFocus
    equivalents.

Testing (items 25–28 DONE, 2026-07-02)

25. Untested public APIs: useFormStateShallow (zero references — its shallow-equality contract is exactly what silently regresses), isAsyncRequiredError, restore() during in-flight async validation.
26. No StrictMode tests at all — the examples run under StrictMode but the tests never do; double-mount behavior matters for useForm stability and useFieldArray ids.
27. Missing cleanup() in 15 of 17 React test files — globals: false disables Testing Library auto-cleanup. Fix once with a vitest setup file (afterEach(cleanup)).
28. No fake timers — the debounce test races real 50ms timers against waitFor; a plausible CI flake. Convert to vi.useFakeTimers().

Tooling, packaging, and repo hygiene (items 29–34 DONE, 2026-07-02; repository URL in package.json assumes github.com/Scrumrot/zustand-forms — correct if wrong)

29. No CI — there's no .github/workflows/ (and no git remote configured). A minimal GitHub Actions workflow running typecheck + test + build on push/PR is the single highest-leverage infra addition before publishing.
30. No real linter — the lint script is just tsc --noEmit. Add ESLint with eslint-plugin-react-hooks (it would have flagged the useFieldArray render-phase mutation) and Prettier or Biome.
31. package.json is missing publish metadata — no repository, author, homepage, bugs, or engines. Also add "types": "./dist/index.d.cts" inside the require export condition (the sibling .d.cts mostly works, but the explicit condition is the correct pattern — verify with arethetypeswrong).
32. No CHANGELOG or release automation — consider Changesets before the first publish.
33. Dependency currency: vitest 2.1.9 is a major version behind, jsdom 25 likewise; everything else (TS 5.9, React 19.2, zod 4.4, zustand 5.0, tsup 8.5) is current.
34. No coverage reporting — vitest coverage is a one-liner to enable and would make the gaps in #25 visible.

Examples and docs

35. The shipped bound components are never showcased — three example forms (ConditionalForm, ServerErrorsForm, WizardForm) each reimplement a local TextField instead of using the library's. Migrate them and add a "Bound fields" tab.
36. Never demoed: createFormContext, the flag hooks (useIsDirty/useIsValid/...), diff()/dirtyFields() (a natural fit for the existing AutosaveForm), validateOnMount, and an unsaved-changes navigation guard.
37. README is genuinely good; worth adding a note that z.coerce.* collapses typed paths (since values are typed as z.input), and documenting the shallow-merge semantics of reset(partial).



results
____________________________
2. Async routing (validation.ts, createForm.ts) — isAsyncRequiredError now checks instanceof z.core.$ZodAsyncError (keeping the message regex only as a dual-package-hazard fallback). Sync validate()/validateField() no longer throw on async schemas: they start the async pass and return { kind: "pending",
   promise }; validateFields returns the Promise<boolean> itself. The types split into SettledValidationResult / ValidationResult so async paths still narrow cleanly.

3. Scoped field validation — validateField/validateFieldAsync now parse just the field's subschema when the path is reachable through refinement-free objects/arrays, so an async username check no longer fires when you validate an unrelated field (there's a test asserting the refine call count stays 0).
   When a traversed level has refinements (cross-field rules), it falls back to a full parse. Errors are written and cleared by path prefix, so validateField("address") now surfaces address.city errors instead of reporting "valid".

4. Server errors survive validation — setError/setErrors keys are tracked as manual. Full-form passes (including a background validateAsync and submit) preserve them where the schema is silent; they release when the field's value changes, a field-scoped validation targets them, a schema error supersedes
   them, or on clearErrors/reset/adoptValues.

5. Union errors — flattenIssues recurses into invalid_union branch issues (prefixed with the union's path, deduped), so users see "expected number" at pet.lives instead of one generic "Invalid input".

6. SelectField — stays controlled via value ?? "" plus a disabled empty option (with a new optional placeholder prop), eliminating the uncontrolled→controlled warning and the "looks selected but state is undefined" trap. SelectProps lost its type parameter as part of this.

7. useFieldArray — the id reconciler now uses the sanctioned render-phase setState derived-state pattern instead of mutating refs during render, and keys its state on form + path (fixing the form-swap edge case too). New StrictMode tests confirm ids stay glued to items across reorders under
   double-rendering.

Two small API notes: validateFields' return type widened to boolean | Promise<boolean>, and consumers of validate/validateField should handle the new "pending" kind — both documented in the README, both strictly better than the previous "throws" behavior.


What items 8–13 added

8. Accessibility — All four bound components now render name={path} (autofill/password managers/native posts), aria-invalid when errored, and aria-describedby pointing at the error text, which renders with role="alert" so screen readers announce it. The prop builders (textInputProps etc.) emit name and
   aria-invalid too, via a new path property on UseFieldReturn.

9. submit result — Now resolves a discriminated SubmitResult: { kind: "valid", data }, { kind: "invalid", errors }, or { kind: "skipped" }. No more true-for-invalid trap; the parsed data comes back on success.

10. Touched on failed submit — An invalid submit marks every errored field touched (skipping the "" root-refine key), so touched-gated error UIs show errors after the canonical first submit.

11. Focus management — Field components accept a ref to the underlying input/select (React 19 ref-as-prop, typed as a structural FieldRef<T> so it works even when a consumer resolves a different @types/react copy — that bit came out of a real type conflict with the examples app). New
    focusFirstError(errors, root?) helper focuses the first errored control in DOM order by its name; one line in the onInvalid handler wires it up.

12. Typed write surface — setValue, setTouched, setError, clearErrors, validateField(s), and all array ops now take FieldPath-typed paths with value types checked (setValue("age", "thirty") and arrayPush("tags", 42) are compile errors). Dynamic array paths like `users.${i}.email` still typecheck via
    template-literal types. FieldFormApi/FieldArrayFormApi switched to method-shorthand syntax so the narrowed Form still satisfies them — zero casts in the React layer.

13. Optional-object paths — FieldPath recurses through optional/nullable levels ("profile.name" works for profile: z.object({...}).optional()), and FieldValue honestly widens those values with | undefined.

The only test casualty across the whole batch was the intentional arrayPush-on-a-string test, which now needs an as never cast — i.e., the type system catches at compile time what used to be only a runtime warning.

Next up whenever you want: the medium batch (14–24: path parsing edge cases, reset options, index validation, error-identity churn, NumberField polish, useForm dev-warn) or the testing/tooling items (25–34: CI workflow, ESLint, vitest setup file, coverage).

Items 14–24 are done and committed as 6b380b3 — 317 tests across 60 files passing, library and examples typecheck clean.

What this batch changed

14. Path semantics (path.ts) — The existing container now decides how a segment is interpreted: arrays take numeric segments as indices, plain objects take any segment as a string key. A z.record keyed "0" reads/writes the record key instead of being silently replaced by an array. String-key writes into
    arrays warn and no-op, and array writes past index 100,000 are refused instead of allocating gigabytes on a typo'd path. The dot-in-key limitation is now documented.

15. reset overhaul — reset(partial) only spreads when both sides are plain records; an array-rooted schema replaces wholesale instead of corrupting into {0: ..., 1: ...}. New ResetOptions (keepErrors/keepTouched/keepDirty/keepSubmitCount), plus resetField(path) (restores the initial value and clears the
    field's and descendants' meta) and getFieldState(path) (typed one-shot field slice).

16. Array index validation — arrayRemove(path, -1) used to grow the array and corrupt the error/touched maps; all indexed ops now validate integer-and-in-range before anything mutates, warning and no-op-ing otherwise.

17. Error identity stability — Every validation write now reuses the previous error-array references (and the whole map) when messages are unchanged, so fields showing an error no longer re-render on every full pass, and watchField doesn't re-fire — there's a test pinning that.

18. NumberField — Gates on Number.isFinite (no more Infinity), treats whitespace as empty instead of 0, and external writes (reset/adoptValues) now win over in-progress raw text via the same derived-state pattern used in useFieldArray. The dead step prop is gone. numberInputProps got the same parsing
    guards.

19. useForm footgun warning — Warns once (per component instance) when a different schema reference shows up after mount, pointing at adoptValues/reset for late-arriving values and noting that inline schemas are harmless but worth hoisting.

20. Rename — useFormSelector/useFormSelectorShallow are the new names; useFormState/useFormStateShallow remain as @deprecated aliases so the examples and existing users keep working.

21. isValidatingForm — Whole-form async validation state is now a proper boolean on FormState instead of the "__form__" sentinel key squatting in the field map.

22–23. The stale src/react/index.ts barrel is deleted, and useFieldArray uses a hoisted constant empty array so forms with not-yet-created array paths stop re-rendering on every store change.

24. Grab bag — Dates compare by timestamp in dirty tracking (re-picking the same date reads clean), clearErrors("items") clears items.0.name too, setError accepts a single string, the debounce cleanup tracks debounceMs changes, and "onTouched" / "all" join the validation modes.

That closes out everything through item 24. What's left on the list is the testing batch (25–28: fake timers, a vitest setup file with auto-cleanup, coverage for useFormSelectorShallow/restore-during-async) and tooling/packaging (29–34: CI workflow, ESLint, publish metadata, changesets, dependency bumps,
coverage reporting), plus the examples/docs items (35–37). Say the word and I'll keep going.
