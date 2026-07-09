import type { ComponentProps } from "react";
import { cn } from "../cn";

export type TextareaProps = Readonly<ComponentProps<"textarea">>;

export const Textarea = ({ className, ...props }: TextareaProps) => (
  <textarea
    data-slot="textarea"
    className={cn(
      "flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      "aria-invalid:border-destructive aria-invalid:ring-destructive/40",
      className,
    )}
    {...props}
  />
);
