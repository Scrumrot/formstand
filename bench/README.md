# Benchmarks

Run with `npx vitest bench --run`.

## validation.bench.ts — why the per-field subschema path exists

Measured on a realistic form (50 string fields + nested object + 20 array
rows), Node 22, 2026-07:

| operation | mean |
| --- | --- |
| full-form parse, valid | ~6 µs |
| full-form parse, one invalid field | ~30 µs |
| full-form parse through a root refine | ~7 µs |
| per-field subschema parse (leaf) | ~0.15 µs |
| subschema extraction walk (uncached; cached per form) | ~1.5 µs |

Conclusion: sync CPU cost is **not** the reason the subschema fast path
exists — a full parse per keystroke is ~6 µs, invisible next to a 16 ms
frame. The fast path earns its complexity because it validates one field in
*isolation*: with an async refine in the schema (e.g. a server-side
uniqueness check), a full-parse-per-keystroke design would fire that check
on every keystroke in **any** field. Scoped validation also keeps cost flat
as forms grow. If the library ever drops async-refine support, revisit —
full-parse-only would delete `fieldSchemaAtPath`, `slotAtPath`, and the
subschema cache.
