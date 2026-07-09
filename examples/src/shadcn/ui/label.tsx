import type { ComponentProps } from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "../cn";

export type LabelProps = Readonly<ComponentProps<typeof LabelPrimitive.Root>>;

export const Label = ({ className, ...props }: LabelProps) => (
  <LabelPrimitive.Root
    data-slot="label"
    className={cn(
      "flex select-none items-center gap-2 text-sm font-medium leading-none",
      className,
    )}
    {...props}
  />
);
