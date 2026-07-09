import type { ComponentProps } from "react";
import { cn } from "../cn";

export type BadgeProps = Readonly<ComponentProps<"span">>;

// Trimmed from stock shadcn: the playground only renders outline badges, so
// the cva variant machinery is gone — restore it from upstream if a demo
// ever needs the filled variants.
export const Badge = ({ className, ...props }: BadgeProps) => (
  <span
    data-slot="badge"
    className={cn(
      "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium text-foreground",
      className,
    )}
    {...props}
  />
);
