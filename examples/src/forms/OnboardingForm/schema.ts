import { z } from "zod";

// Select options live here as the single source of truth: the schema
// derives its enum values from them, the field components render them.

export const REGION_OPTIONS = [
  { value: "west", label: "West" },
  { value: "mountain", label: "Mountain" },
  { value: "central", label: "Central" },
  { value: "east", label: "East" },
] as const;

export const COUNTRY_OPTIONS = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "au", label: "Australia" },
] as const;

export const DEPARTMENT_OPTIONS = [
  { value: "engineering", label: "Engineering" },
  { value: "design", label: "Design" },
  { value: "product", label: "Product" },
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
] as const;

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
] as const;

export const LAPTOP_OPTIONS = [
  { value: "macbook-pro", label: "MacBook Pro" },
  { value: "thinkpad", label: "ThinkPad" },
  { value: "framework", label: "Framework" },
] as const;

export const SHIRT_SIZE_OPTIONS = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
  { value: "2xl", label: "2XL" },
] as const;

// Tuple-preserving value extraction, so z.enum keeps the literal union
// (a plain .map() would widen to string[] and the field would type as
// string instead of the union).
const optionValues = <T extends readonly Readonly<{ value: string }>[]>(
  options: T,
): { [K in keyof T]: T[K]["value"] } =>
  options.map((option) => option.value) as { [K in keyof T]: T[K]["value"] };

export const onboardingSchema = z.object({
  personal: z.object({
    firstName: z.string().min(1, "required"),
    lastName: z.string().min(1, "required"),
    // "No preferred name" is null, not "" — clearing the input round-trips
    // to null via field.emptyValue.
    preferredName: z.string().min(1, "clear the field for none").nullable(),
    email: z.email("valid email required"),
    phone: z.string().min(7, "valid phone required"),
  }),
  address: z.object({
    street: z.string().min(1, "required"),
    unit: z.string().nullable(),
    city: z.string().min(1, "required"),
    region: z.enum(optionValues(REGION_OPTIONS), "pick a region"),
    postalCode: z.string().regex(/^\d{5}$/, "5 digits"),
    country: z.enum(optionValues(COUNTRY_OPTIONS), "pick a country"),
  }),
  employment: z.object({
    jobTitle: z.string().min(1, "required"),
    department: z.enum(optionValues(DEPARTMENT_OPTIONS), "pick a department"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a start date"),
    employmentType: z.enum(optionValues(EMPLOYMENT_TYPE_OPTIONS)),
    salary: z.number("salary required").positive("must be positive"),
    remote: z.boolean(),
    managerEmail: z.email("valid email required"),
  }),
  equipment: z.object({
    laptop: z.enum(optionValues(LAPTOP_OPTIONS), "pick a laptop"),
    monitorCount: z.int("whole number").min(0, "0-4").max(4, "0-4"),
    needsPhone: z.boolean(),
    shirtSize: z.enum(optionValues(SHIRT_SIZE_OPTIONS), "pick a size"),
    notes: z.string().max(200, "200 chars max").nullable(),
  }),
  emergencyContacts: z
    .array(
      z.object({
        name: z.string().min(1, "required"),
        relationship: z.string().min(1, "required"),
        phone: z.string().min(7, "valid phone required"),
      }),
    )
    .min(1, "add at least one contact"),
});
