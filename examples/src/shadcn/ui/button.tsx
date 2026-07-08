import type { ComponentProps } from "react";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "../cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 gap-1.5 rounded-md px-3 text-xs",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

// `type` defaults to "button" (native buttons default to "submit", which
// makes every action button inside a <form> a surprise submitter).
export const Button = ({
  className,
  variant,
  size,
  type,
  ...props
}: ButtonProps) => (
  <button
    data-slot="button"
    type={type ?? "button"}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
);
