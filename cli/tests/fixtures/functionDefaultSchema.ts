import { z } from "zod";

// A factory whose RESOLVED default is itself a function. zod v4's
// def.defaultValue getter runs the factory (returning `callback`), and the
// old capture code then INVOKED that resolved function — executing
// arbitrary user code at generation time. The tracker proves the walk never
// calls it: reading the getter flips nothing; only calling callback() would.
export const callTracker = { called: false };

const callback = (): void => {
  callTracker.called = true;
};

export const functionDefaultSchema = z.object({
  onPing: z
    .custom<() => void>((value) => typeof value === "function")
    .default(() => callback),
  name: z.string(),
});
