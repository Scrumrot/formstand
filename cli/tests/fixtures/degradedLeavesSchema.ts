import { z } from "zod";

// Every leaf shape the walker degrades to a text stand-in, at every
// position a leaf can sit: the root, an object section, an array row (an
// object row, a tuple row, a union row), and a union variant. The library's
// bound components type their `path` prop by VALUE (PathsAccepting), so a
// stand-in bound as `<TextField path="meta" />` is a compile error wherever
// the real value is not text; the emitters must pin every one of these
// through useField instead. One fixture keeps the proof in one program per
// backend and layout.
export const degradedLeavesSchema = z.object({
  name: z.string(),
  meta: z.record(z.string(), z.string()),
  big: z.bigint(),
  lazy: z.lazy(() => z.string()),
  anything: z.any(),
  five: z.literal(5),
  // A numeric enum-like object: entries carry numbers, so the walker
  // refuses it as a string enum.
  level: z.enum({ Low: 1, High: 2 }),
  tags: z.map(z.string(), z.number()),
  section: z.object({
    label: z.string(),
    inner: z.record(z.string(), z.string()),
  }),
  rows: z.array(
    z.object({
      title: z.string(),
      meta: z.record(z.string(), z.string()),
      big: z.bigint(),
    }),
  ),
  pairs: z.array(z.tuple([z.string(), z.bigint()])),
  events: z.array(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("note"), meta: z.record(z.string(), z.string()) }),
      z.object({ kind: z.literal("count"), n: z.number() }),
    ]),
  ),
  payment: z.discriminatedUnion("method", [
    z.object({
      method: z.literal("card"),
      extra: z.record(z.string(), z.string()),
      last4: z.string(),
    }),
    z.object({ method: z.literal("cash") }),
  ]),
});
