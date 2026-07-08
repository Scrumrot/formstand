import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn's `cn` (usually at "@/lib/utils"): clsx for conditional class
// composition, tailwind-merge so a caller's `h-10` beats a component's
// default `h-9` instead of both landing in the class list.
export const cn = (...inputs: readonly ClassValue[]): string =>
  twMerge(clsx(inputs));
