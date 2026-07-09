import type { ComponentProps } from "react";
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "../cn";

export type CheckboxProps = Readonly<
  ComponentProps<typeof CheckboxPrimitive.Root>
>;

export const Checkbox = ({ className, ...props }: CheckboxProps) => (
  <CheckboxPrimitive.Root
    data-slot="checkbox"
    className={cn(
      "peer size-4 shrink-0 rounded-[4px] border border-input outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/40 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      data-slot="checkbox-indicator"
      className="grid place-items-center text-current"
    >
      <CheckIcon className="size-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);
