import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "../cn";

export const Switch = ({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root
    data-slot="switch"
    className={cn(
      "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className="pointer-events-none block size-4 rounded-full bg-foreground transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0"
    />
  </SwitchPrimitive.Root>
);
