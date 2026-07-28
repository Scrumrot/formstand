import { z } from "zod";

// WALKER-truncation probe: the leaf sits at ELEVEN segments
// (m1...m10.count), one past even the derived default nesting budget
// (FORMSTAND_PATH_DEPTH + 2 = 11), so default-flags generation cannot reach
// it — the walker truncates it to a string-kind stand-in BEFORE the
// .nullable() wrapper unwraps (wrong kind AND wrong flags). The generated
// file must still compile: blankNeedsCast sees the todo-bearing required
// fallback and forces the as-unknown-as cast, and the CLI mirrors the
// truncated path as its own stderr warning.
export const deeperPathsSchema = z.object({
  m1: z.object({
    m2: z.object({
      m3: z.object({
        m4: z.object({
          m5: z.object({
            m6: z.object({
              m7: z.object({
                m8: z.object({
                  m9: z.object({
                    m10: z.object({
                      count: z.number().nullable(),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
  title: z.string(),
});
