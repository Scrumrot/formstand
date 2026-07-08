import type { ComponentProps } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "../cn";

// Single-thumb variant (the demos bind one number per slider); stock shadcn
// renders one thumb per entry in `value`.
export const Slider = ({
  className,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) => (
  <SliderPrimitive.Root
    data-slot="slider"
    className={cn(
      "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track
      data-slot="slider-track"
      className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
    >
      <SliderPrimitive.Range
        data-slot="slider-range"
        className="absolute h-full bg-primary"
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm transition-[color,box-shadow] outline-none hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/50 disabled:pointer-events-none"
    />
  </SliderPrimitive.Root>
);
