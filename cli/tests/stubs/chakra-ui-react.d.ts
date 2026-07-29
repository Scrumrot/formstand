// Minimal structural stand-in for @chakra-ui/react v3, mapped in via `paths`
// by the typecheck tests (the real package is not a dependency here).
// Deliberately narrow: it declares exactly the compound components, prop
// names, and style props the chakra emitter uses, typed with the adapter's
// shapes, so the generated chakra output is structurally typechecked instead
// of merely parsed — escaping or prop-name regressions fail the suite. The
// REAL 3.x declarations are exercised by the cli/matrix harness.
import type { ChangeEvent, ReactElement, ReactNode } from "react";

// The chakra style props the emitter writes (Chakra 3 accepts any CSS
// property as a style prop; these are the ones the backends emit).
type StyleProps = Readonly<{
  display?: string;
  gridTemplateColumns?: string;
  gridColumn?: string;
  gap?: string;
  p?: string;
  borderWidth?: string;
  borderRadius?: string;
  maxW?: string;
}>;

export declare const Box: (
  props: StyleProps &
    Readonly<{
      as?: string;
      onSubmit?: (event: Readonly<{ preventDefault: () => void }>) => unknown;
      children?: ReactNode;
    }>,
) => ReactElement;

export declare const Stack: (
  props: StyleProps & Readonly<{ children?: ReactNode }>,
) => ReactElement;

export declare const Heading: (
  props: StyleProps & Readonly<{ size?: string; children?: ReactNode }>,
) => ReactElement;

export declare const Text: (
  props: StyleProps &
    Readonly<{ color?: string; role?: string; children?: ReactNode }>,
) => ReactElement;

export declare const Button: (
  props: Readonly<{
    type?: "button" | "submit" | "reset";
    variant?: "solid" | "subtle" | "surface" | "outline" | "ghost" | "plain";
    size?: string;
    disabled?: boolean;
    onClick?: () => void;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Input: (
  props: Readonly<{
    type?: string;
    inputMode?: "decimal";
    name?: string;
    value?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

export declare const Field: Readonly<{
  Root: (
    props: Readonly<{ invalid?: boolean; children?: ReactNode }>,
  ) => ReactElement;
  Label: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
  ErrorText: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
}>;

export declare const NativeSelect: Readonly<{
  Root: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
  Field: (
    props: Readonly<{
      placeholder?: string;
      name?: string;
      value?: string;
      onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
      onBlur?: () => void;
      children?: ReactNode;
    }>,
  ) => ReactElement;
  Indicator: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
}>;

export declare const Switch: Readonly<{
  Root: (
    props: Readonly<{
      name?: string;
      checked?: boolean;
      onCheckedChange?: (details: Readonly<{ checked: boolean }>) => void;
      onBlur?: () => void;
      children?: ReactNode;
    }>,
  ) => ReactElement;
  HiddenInput: (props: Readonly<Record<string, never>>) => ReactElement;
  Control: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
  Thumb: (props: Readonly<Record<string, never>>) => ReactElement;
  Label: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
}>;

export declare const Card: Readonly<{
  Root: (
    props: StyleProps &
      Readonly<{
        variant?: "elevated" | "outline" | "subtle";
        children?: ReactNode;
      }>,
  ) => ReactElement;
  Body: (props: StyleProps & Readonly<{ children?: ReactNode }>) => ReactElement;
}>;

export declare const Accordion: Readonly<{
  Root: (
    props: StyleProps &
      Readonly<{
        collapsible?: boolean;
        defaultValue?: readonly string[];
        children?: ReactNode;
      }>,
  ) => ReactElement;
  Item: (
    props: Readonly<{ value: string; children?: ReactNode }>,
  ) => ReactElement;
  ItemTrigger: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
  ItemIndicator: (props: Readonly<Record<string, never>>) => ReactElement;
  ItemContent: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
  ItemBody: (
    props: StyleProps & Readonly<{ children?: ReactNode }>,
  ) => ReactElement;
}>;
