import type { ComponentProps } from "react";
import { cn } from "../cn";

export const Input = ({ className, ...props }: ComponentProps<"input">) => (
  <input
    data-slot="input"
    className={cn(
      "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:opacity-50",
      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      "aria-invalid:border-destructive aria-invalid:ring-destructive/40",
      className,
    )}
    {...props}
  />
);
