// Minimal structural stand-ins for the consumer's shadcn/ui components,
// included as an extra root file by the typecheck tests (ambient `declare
// module` blocks resolve the "@/components/ui/*" alias imports without a real
// app). Deliberately narrow: exactly the components and prop names the shadcn
// emitter uses, typed with the adapter's shapes, so the generated output is
// structurally typechecked instead of merely parsed.

declare module "@/components/ui/button" {
  import type { ReactElement, ReactNode } from "react";
  export const Button: (
    props: Readonly<{
      type?: "button" | "submit" | "reset";
      variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
      size?: "default" | "sm" | "icon";
      className?: string;
      disabled?: boolean;
      onClick?: () => void;
      children?: ReactNode;
    }>,
  ) => ReactElement;
}

declare module "@/components/ui/checkbox" {
  import type { ReactElement } from "react";
  export const Checkbox: (
    props: Readonly<{
      id?: string;
      name?: string;
      checked?: boolean;
      "aria-invalid"?: boolean;
      "aria-label"?: string;
      onCheckedChange?: (checked: boolean | "indeterminate") => void;
      onBlur?: () => void;
    }>,
  ) => ReactElement;
}

declare module "@/components/ui/textarea" {
  import type { ChangeEvent, ReactElement } from "react";
  // The textarea override's control: Input's surface on a textarea element.
  export const Textarea: (
    props: Readonly<{
      id?: string;
      name?: string;
      value?: string;
      rows?: number;
      "aria-invalid"?: boolean;
      onChange?: (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => void;
      onBlur?: () => void;
    }>,
  ) => ReactElement;
}

declare module "@/components/ui/input" {
  import type { ChangeEvent, ReactElement } from "react";
  export const Input: (
    props: Readonly<{
      id?: string;
      type?: string;
      name?: string;
      value?: string;
      className?: string;
      // The native datalist hookup (shadcn's Input forwards DOM props) —
      // the autocomplete override binds suggestions through it.
      list?: string;
      "aria-invalid"?: boolean;
      "aria-label"?: string;
      onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
      onBlur?: () => void;
    }>,
  ) => ReactElement;
}

declare module "@/components/ui/label" {
  import type { ReactElement, ReactNode } from "react";
  export const Label: (
    props: Readonly<{
      htmlFor?: string;
      className?: string;
      children?: ReactNode;
    }>,
  ) => ReactElement;
}

declare module "@/components/ui/select" {
  import type { ReactElement, ReactNode } from "react";
  export const Select: (
    props: Readonly<{
      name?: string;
      value?: string;
      onValueChange?: (value: string) => void;
      onOpenChange?: (open: boolean) => void;
      children?: ReactNode;
    }>,
  ) => ReactElement;
  export const SelectTrigger: (
    props: Readonly<{
      id?: string;
      className?: string;
      "aria-invalid"?: boolean;
      "aria-label"?: string;
      children?: ReactNode;
    }>,
  ) => ReactElement;
  export const SelectValue: (
    props: Readonly<{ placeholder?: string }>,
  ) => ReactElement;
  export const SelectContent: (
    props: Readonly<{ children?: ReactNode }>,
  ) => ReactElement;
  export const SelectItem: (
    props: Readonly<{ value: string; children?: ReactNode }>,
  ) => ReactElement;
}

// The table primitives an array of flat object rows renders with (shadcn's
// table recipe: thead/tbody/tr/th/td wrappers under one Table).
declare module "@/components/ui/table" {
  import type { ReactElement, ReactNode } from "react";
  export const Table: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
  export const TableHeader: (
    props: Readonly<{ children?: ReactNode }>,
  ) => ReactElement;
  export const TableBody: (
    props: Readonly<{ children?: ReactNode }>,
  ) => ReactElement;
  export const TableRow: (
    props: Readonly<{ key?: string; children?: ReactNode }>,
  ) => ReactElement;
  export const TableHead: (
    props: Readonly<{ title?: string; children?: ReactNode }>,
  ) => ReactElement;
  export const TableCell: (
    props: Readonly<{ children?: ReactNode }>,
  ) => ReactElement;
}
