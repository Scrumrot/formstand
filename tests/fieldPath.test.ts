import { describe, expectTypeOf, it } from "vitest";
import type { FieldPath, FieldValue } from "../src/core/fieldPath";

type User = { id: number; profile: { name: string; tags: readonly string[] } };
type Form = {
  name: string;
  age: number;
  address: { city: string; zip: string };
  users: readonly User[];
};

describe("FieldPath", () => {
  it("enumerates top-level keys and nested paths", () => {
    type P = FieldPath<Form>;
    expectTypeOf<"name">().toMatchTypeOf<P>();
    expectTypeOf<"address">().toMatchTypeOf<P>();
    expectTypeOf<"address.city">().toMatchTypeOf<P>();
    expectTypeOf<"users">().toMatchTypeOf<P>();
  });

  it("enumerates array index segments and deeper paths", () => {
    type P = FieldPath<Form>;
    expectTypeOf<`users.${number}`>().toMatchTypeOf<P>();
    expectTypeOf<`users.${number}.id`>().toMatchTypeOf<P>();
    expectTypeOf<`users.${number}.profile.name`>().toMatchTypeOf<P>();
    expectTypeOf<`users.${number}.profile.tags.${number}`>().toMatchTypeOf<P>();
  });
});

describe("FieldValue", () => {
  it("resolves the leaf type for a string path", () => {
    expectTypeOf<FieldValue<Form, "name">>().toEqualTypeOf<string>();
    expectTypeOf<FieldValue<Form, "age">>().toEqualTypeOf<number>();
    expectTypeOf<FieldValue<Form, "address.city">>().toEqualTypeOf<string>();
  });

  it("resolves through array indices", () => {
    expectTypeOf<FieldValue<Form, "users.0">>().toEqualTypeOf<User>();
    expectTypeOf<FieldValue<Form, "users.0.id">>().toEqualTypeOf<number>();
    expectTypeOf<
      FieldValue<Form, "users.5.profile.name">
    >().toEqualTypeOf<string>();
  });
});
