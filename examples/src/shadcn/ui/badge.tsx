import type { ComponentProps } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../cn";

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span
    data-slot="badge"
    className={cn(badgeVariants({ variant }), className)}
    {...props}
  />
);
