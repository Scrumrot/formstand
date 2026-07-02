import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { FieldPath, FieldValue } from "../src/core/fieldPath";
import { createForm } from "../src/core/createForm";

type Profile = Readonly<{ name: string; bio?: string | undefined }>;
type Shape = Readonly<{
  id: number;
  profile?: Profile | undefined;
  nickname: string | null;
  friends?: readonly Profile[] | undefined;
}>;

describe("FieldPath through optional/nullable levels", () => {
  it("addresses paths inside optional objects", () => {
    type P = FieldPath<Shape>;
    expectTypeOf<"profile">().toMatchTypeOf<P>();
    expectTypeOf<"profile.name">().toMatchTypeOf<P>();
    expectTypeOf<"profile.bio">().toMatchTypeOf<P>();
    expectTypeOf<"friends">().toMatchTypeOf<P>();
    expectTypeOf<`friends.${number}.name`>().toMatchTypeOf<P>();
  });
});

describe("FieldValue through optional/nullable levels", () => {
  it("widens with undefined when a traversed level is optional", () => {
    expectTypeOf<FieldValue<Shape, "profile.name">>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<
      FieldValue<Shape, `friends.${number}.name`>
    >().toEqualTypeOf<string | undefined>();
  });

  it("keeps required paths exact", () => {
    expectTypeOf<FieldValue<Shape, "id">>().toEqualTypeOf<number>();
    expectTypeOf<FieldValue<Shape, "nickname">>().toEqualTypeOf<
      string | null
    >();
  });
});

describe("typed write surface", () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    profile: z.object({ bio: z.string() }).optional(),
    tags: z.array(z.string()),
  });
  const form = createForm(schema, {
    initialValues: { name: "Tim", age: 30, tags: [] },
  });

  it("accepts valid paths and values", () => {
    form.setValue("name", "Anna");
    form.setValue("profile.bio", "hi");
    form.setTouched("age");
    form.setError("name", ["server"]);
    form.setError("", ["root error"]);
    form.clearErrors("name");
    form.arrayPush("tags", "x");
    form.arrayRemove("tags", 0);
    form.validateField("profile.bio");
    form.validateFields(["name", "age"]);
  });

  it("rejects typo'd paths and wrong value types", () => {
    // @ts-expect-error — "naem" is not a path of the schema
    form.setValue("naem", "x");
    // @ts-expect-error — age is a number
    form.setValue("age", "thirty");
    // @ts-expect-error — "tagz" is not a path
    form.arrayPush("tagz", "x");
    // @ts-expect-error — tags items are strings
    form.arrayPush("tags", 42);
    // @ts-expect-error — "nope" is not a path
    form.validateField("nope");
  });
});
