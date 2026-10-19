// Type-mode shapes that used to fall to "unsupported" although the zod and
// JSON Schema frontends accept the same shapes: intersections (the type
// flag is Intersection, not Object, while `interface X extends Base`
// already worked), discriminated unions of object types, and unions of
// numeric literals. Plus two things that used to pass silently: a mixed
// index signature beside named members, and a const picked with --type.

export type Base = {
  id: string;
  createdAt: Date;
};

export type Extra = {
  title: string;
  tags?: string[];
};

export type Both = Base & Extra;

// Both members declare `size`, with different types: the later member wins
// and the walker leaves a TODO on the field. (Not literal types: the
// checker reduces an intersection with disjoint LITERAL discriminants to
// `never` outright, so there would be nothing left to walk.)
export type Small = { size: string; weight: number };
export type Large = { size: number; height: number };
export type Conflict = Small & Large;

export type CardPayment = {
  method: "card";
  cardNumber: string;
  expiry?: string;
};

export type BankPayment = {
  method: "bank";
  iban: string;
};

export type Payment = CardPayment | BankPayment;

export type Checkout = {
  email: string;
  payment: Payment;
  // Optional union: undefined is stripped before the discriminant search.
  refund?: Payment;
  // No key is a string literal in every member.
  untagged: { a: string } | { b: number };
  rating: 1 | 2 | 3;
};

export type Mixed = {
  name: string;
  [extra: string]: string;
};

export type HasMixed = {
  label: string;
  extras: Mixed;
};

export const someConst = { kind: "value" } as const;

export const aFunction = (): string => "x";
