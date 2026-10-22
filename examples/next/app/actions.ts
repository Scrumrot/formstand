"use server";

import { type SaveState, signupSchema } from "./schema";

// A server action is a network endpoint: any client can call it with any
// arguments, so the `data` the bridge hands over is typed as the schema's
// output only because the browser promised so. Parse it again, every time,
// with the same schema. formstand's docs make this the rule for every
// "use server" path (validation.md, "Security notes"); this file is what
// the rule looks like in practice.
export const saveSignup = async (
  prev: SaveState,
  data: unknown,
): Promise<SaveState> => {
  const parsed = signupSchema.safeParse(data);
  if (!parsed.success) {
    // A tampered or stale payload: refuse without touching anything. The
    // message is deliberately generic; the browser's own validation has
    // already told an honest client what was wrong.
    return {
      status: "rejected",
      message: "the server refused the payload",
      saves: prev.saves,
    };
  }
  // Stand-in for the real work (a database write, a mail). The example
  // rejects one address to show the failure path end to end.
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (parsed.data.email.toLowerCase().endsWith("@example.com")) {
    return {
      status: "rejected",
      message: "example.com addresses are not accepted",
      saves: prev.saves,
    };
  }
  return {
    status: "saved",
    message: `welcome, ${parsed.data.name} (${parsed.data.plan})`,
    saves: prev.saves + 1,
  };
};
