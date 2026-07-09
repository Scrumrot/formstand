import type { z } from "zod";
import type { onboardingSchema } from "./schema";

export type OnboardingSchema = typeof onboardingSchema;

// The draft shape hooks read and write (z.input: what the form holds while
// being filled, before validation refines it).
export type OnboardingValues = z.input<OnboardingSchema>;

export type EmergencyContact = OnboardingValues["emergencyContacts"][number];
