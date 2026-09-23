import { describe, expect, it } from "vitest";
import { z } from "zod";
import { arrayOpsFor } from "../src/core/arrayOpLog";
import { createForm } from "../src/core/createForm";

// updateState clears the array op log BEFORE notifying subscribers, not
// after: row-id derivation runs synchronously inside the notification, so
// a values patch that reintroduces an array reference an op consumed (a
// snapshot taken before the op, written back wholesale) must not find the
// op's record still chained against that reference. setValues and
// adoptValues already clear first; this pins updateState to the same
// order.

const schema = z.object({
  users: z.array(z.object({ email: z.string() })),
});

describe("updateState and the array op log", () => {
  it("a values patch clears the log before subscribers run", () => {
    const form = createForm(schema, {
      initialValues: { users: [{ email: "a" }, { email: "b" }] },
    });
    const before = form.getState().values;
    form.arrayRemove("users", 0);
    expect(arrayOpsFor(form.store, "users")).toHaveLength(1);

    const seenDuringNotify: number[] = [];
    const unsubscribe = form.store.subscribe(() => {
      seenDuringNotify.push(arrayOpsFor(form.store, "users").length);
    });
    // Reintroduce the exact pre-op array reference through updateState.
    form.updateState(() => ({ values: before }));
    unsubscribe();

    expect(form.getState().values).toBe(before);
    expect(seenDuringNotify).toEqual([0]);
    expect(arrayOpsFor(form.store, "users")).toEqual([]);
  });

  it("a non-values patch leaves the log for its consumer", () => {
    const form = createForm(schema, {
      initialValues: { users: [{ email: "a" }, { email: "b" }] },
    });
    form.arrayRemove("users", 0);
    form.updateState((state) => ({ touched: { ...state.touched, users: true } }));
    expect(arrayOpsFor(form.store, "users")).toHaveLength(1);
    expect(form.getState().touched["users"]).toBe(true);
  });

  it("an empty patch is a no-op that keeps the state reference", () => {
    const form = createForm(schema, {
      initialValues: { users: [] },
    });
    const state = form.getState();
    form.updateState(() => ({}));
    expect(form.getState()).toBe(state);
  });

  it("the updater still sees the current state", () => {
    const form = createForm(schema, {
      initialValues: { users: [{ email: "a" }] },
    });
    form.updateState((state) => ({
      values: { users: [...state.values.users, { email: "b" }] },
    }));
    expect(form.getState().values.users.map((u) => u.email)).toEqual(["a", "b"]);
  });
});
