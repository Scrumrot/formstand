import type { ComponentProps } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "../cn";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export type SelectTriggerProps = Readonly<
  ComponentProps<typeof SelectPrimitive.Trigger>
>;

export const SelectTrigger = ({
  className,
  children,
  ...props
}: SelectTriggerProps) => (
  <SelectPrimitive.Trigger
    data-slot="select-trigger"
    className={cn(
      "flex h-9 w-fit items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/40 data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="size-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
);

// Stock shadcn portals the dropdown to <body>; the playground's theme is
// scoped under `.shadcn-scope`, so the content renders in place instead
// (popper positioning still floats it over the page) to stay inside the
// themed subtree. In an app with :root-level variables, keep the Portal.
export type SelectContentProps = Readonly<
  ComponentProps<typeof SelectPrimitive.Content>
>;

export const SelectContent = ({
  className,
  children,
  ...props
}: SelectContentProps) => (
  <SelectPrimitive.Content
    data-slot="select-content"
    position="popper"
    className={cn(
      "z-50 max-h-96 min-w-[8rem] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.Viewport className="p-1">
      {children}
    </SelectPrimitive.Viewport>
  </SelectPrimitive.Content>
);

export type SelectItemProps = Readonly<
  ComponentProps<typeof SelectPrimitive.Item>
>;

export const SelectItem = ({
  className,
  children,
  ...props
}: SelectItemProps) => (
  <SelectPrimitive.Item
    data-slot="select-item"
    className={cn(
      "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
);
