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
      onCheckedChange?: (checked: boolean | "indeterminate") => void;
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
      "aria-invalid"?: boolean;
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
