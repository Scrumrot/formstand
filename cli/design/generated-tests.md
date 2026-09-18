# Design: generated tests (`--tests`)

Status: **decided 2026-09-18** — the five open questions below are
resolved (Tim delegated the calls); the design is ready to implement.
Nothing here is implemented yet.

## The one-line pitch

The schema already knows what to assert. `formstand-gen` emits a spec
beside the component that proves the validation and submit paths — the
coverage nobody writes by hand — derived from the same IR the component
came from, so the spec and the form cannot drift.

## Goals

- A generated spec that fails when the FORM is broken, not when the markup
  is restyled: validation messages, gate behavior, submit payloads.
- Runners as a list, not a choice: `--tests vitest,playwright` emits a
  component spec AND a browser spec, different tests, not one template
  with syntax variants.
- Kit output works: the config supplies the app's own render wrapper,
  since generated MUI/Chakra/Mantine components do not render without
  their provider and the generator deliberately never emits providers.

## Non-goals

- Proving the library (its own suite does that). Generated specs assert
  what THIS schema demands of THIS form.
- Snapshot tests, DOM-structure assertions, or style checks: trivia
  dressed as confidence, and the first thing to rot.
- A test for every field. A required-string message proven once per
  KIND-SHAPE, not once per field, keeps the suite meaningful (see "The
  no-trivia rule").

## The shape

### CLI and config surface

```
formstand-gen schema.ts --tests vitest
formstand-gen schema.ts --tests vitest,playwright
```

```ts
// formstand.config.ts
export default {
  tests: {
    runners: ["vitest", "playwright"],
    // Component specs: the app's own render, replacing bare rtl render.
    // The generated spec imports it; without one, plain output renders
    // bare and kit output emits a loud TODO at the top of the spec.
    renderWrapper: "./test/renderWithProviders",
    // Browser specs: fixtures/baseURL forwarded into the emitted
    // playwright file's `test.use(...)`.
    playwright: { baseURL: "http://localhost:5173", route: "/onboarding" },
  },
} satisfies FormstandConfig;
```

Decisions baked in:

- `--tests` takes a comma list mirroring how `ui`/`layout` read; the
  config block is the durable spelling.
- `jest` and `vitest` share one component-spec emitter (imports differ,
  bodies identical). Playwright is its own emitter.
- Specs are emitted BESIDE the output: `OnboardingForm.test.tsx`
  (component) and `OnboardingForm.e2e.ts` (browser); module layout puts
  them in the module folder next to `index.ts`.

### The case IR

One walk of the existing `FieldSpec` IR produces `TestCase[]`, and every
runner emits from it — the same front-end/back-end split the generator
already lives by:

```ts
type TestCase =
  | { kind: "required";  path; label; message; fill: FillPlan }
  | { kind: "bound";     path; label; message; bad: Literal; good: Literal } // min/max/length/email/url/regex
  | { kind: "enumChoice"; path; label; options }
  | { kind: "arrayMin";  path; label; message; rows: number }
  | { kind: "unionSwitch"; path; discriminant; tags; perTagFields }
  | { kind: "submitValid"; fill: FillPlan; expectPayload: Literal }
  | { kind: "submitInvalid"; expectMessages: readonly [path, message][] };
```

- Messages come from the schema when the author wrote them (`min(1,
  "add at least one")`); otherwise the case asserts *presence of an
  error at the path*, never zod's default prose, which is upgrade-bait.
- `FillPlan` reuses `emitInitialValues`'s machinery to produce a VALID
  value set (the inverse of the blank set): the walker already knows a
  passing value for every kind. Defaults and literals seed themselves;
  a bounded number fills with its minimum; an enum with its first
  option.
- The walk respects the same boundaries as everything else: depth-TODO
  and unaddressable fields produce no cases; a truncated subtree
  produces a comment in the spec naming why.

### The component spec (vitest/jest)

Two layers, chosen per case:

1. **Store-level cases ride `formstand/testing`** (0.20): `fillField`,
   `fillAndBlurField`, `submitForm`. No render at all for pure
   validation cases — fast, and immune to markup drift. This is the new
   dependency that makes the whole feature cheap: the helpers already
   encode the mode gates the spec must respect.
2. **Render cases prove the wiring**: one mount via the configured
   `renderWrapper` (or bare render for plain output), then per case:
   fill by LABEL (the generator knows every label it emitted), assert
   the message appears (`findByText`), submit and assert the handler
   received the parsed payload. Labels, not test-ids: the generated
   markup already associates labels for a11y, and asserting through
   them keeps the spec honest about what users see.

The split answers the no-trivia worry: store-level cases scale with the
schema for free, render cases stay a handful (one per section/kind-shape,
plus submit round-trips).

### The browser spec (playwright)

Navigate `baseURL + route`, fill by role+label, submit, assert visible
messages and the success path. Emitted only when the config provides
`playwright.baseURL` — a browser spec that guesses its URL is a broken
spec with extra steps. Fixtures pass through `test.use`.

### The no-trivia rule (mechanical, not vibes)

A case is emitted when it asserts something the schema DEMANDS:

- required/bound/arrayMin/unionSwitch cases: one per field that carries
  the constraint, but render-level duplicates are deduped per
  kind-shape (proving "required string shows its message through this
  kit's error slot" once is proof for all of them; the store-level case
  still covers each field's own message).
- `submitValid` and `submitInvalid`: always, once each. They are the
  test people actually want.
- No case ever asserts "it renders" alone.

### Version floors and guards

- `formstand/testing` floor: 0.20 (documented in quick-start's
  version-needs line like every floor before it).
- The generated spec is REGENERATED alongside the component; the
  playground's freshness guard extends to the emitted demo specs so
  emitter drift fails CI the same way component drift does.
- Matrix: one generated spec per kit typechecked against the stubs
  (execution stays in the repo's own vitest run for the plain backend —
  running six kits' specs would test the kits, not the generator).

## Decisions (2026-09-18)

The former open questions, resolved:

1. **Async refines: probe at generation time; `it.skip` the affected
   cases with the stub seam named.** The generator runs a blank-set
   `safeParse` while emitting; the async-parse error marks the schema
   async. For async schemas, field-level cases swap the gate-reliant
   fill for an explicit `await form.validateFieldsAsync([path])`, and
   submit-level cases emit FULLY WRITTEN but as `it.skip` with a
   comment naming what to stub (the refine's IO). A compiling,
   correct-reading case the author activates by deleting `.skip` beats
   both a missing case and a suite that hits the network on arrival.
2. **Messages: presence-only for authorless constraints.** An authored
   message asserts its exact text — the project owns it. An authorless
   constraint asserts only that an error exists at the path; pinning
   zod's default prose would make every zod upgrade a test-suite
   incident over text nobody wrote.
3. **Kit widgets: v1 browser specs are plain + shadcn only.** Kit
   interaction sequences (portaled selects, autocomplete listboxes) are
   a per-kit maintenance treadmill against DOM internals the kits do
   not stabilize. Kit backends still get component specs, with
   render-layer fills restricted to text-shaped controls (real inputs
   in every kit) and enum/select proof staying store-level. Kit browser
   specs are documented as not emitted; revisit on demand.
4. **`renderWrapper` has no default.** Generating a providers file
   would contradict the generator's no-providers stance. Plain/shadcn
   render bare; kit output without a configured wrapper gets a
   generation-time stderr warning (the depth-warning channel) and its
   render-layer cases emitted `it.skip` — green but honest, with the
   store-level cases still running since they need no render.
5. **Coupling: the pair regenerates as one unit; labels are the drift
   alarm.** Both files carry the "yours now" header, the CLI writes
   component and spec together, and the docs say regenerating either
   means both. No checksum ceremony beyond that: the spec fills by
   label, labels are schema-derived, so a hand-renamed label breaks the
   spec loudly — the spec doing its job.
