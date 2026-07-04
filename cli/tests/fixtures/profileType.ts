// Mirrors ./profileSchema.ts — keep the two in sync, the fromType test
// asserts their IRs match.
export type Profile = {
  firstName: string;
  age?: number;
  bio: string | null;
  isAdmin: boolean;
  role: "admin" | "editor" | "viewer";
  birthday?: Date;
  address: {
    street: string;
    city: string;
    zip?: string;
  };
  contacts: {
    email: string;
    phone: string | null;
    kind: "home" | "work";
  }[];
};
