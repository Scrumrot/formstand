// Minimal structural stand-in for @mantine/core, mapped in via `paths` by
// the custom-template typecheck test AND the --ui mantine backend tests (the
// real package is not a dependency here; the REAL 9.x declarations are
// exercised by the cli/matrix harness). Deliberately narrow: exactly the
// controls the mantine backend emits and a Mantine template spreads the
// formstand prop builders onto, each prop typed to accept the builder output
// (name/value/checked/onChange/onBlur/aria-invalid/type/inputMode) plus the
// label, error, and data props written explicitly — so the generated output
// is structurally typechecked, not merely parsed.
import type { ChangeEvent, ReactElement, ReactNode } from "react";

// The inline-style escape hatch the backend uses for full-row spans (and the
// row border radius) — Mantine accepts a plain React style object.
type StyleAttr = Readonly<{
  style?: Readonly<{ gridColumn?: string; borderRadius?: string | number }>;
}>;

export declare const TextInput: (
  props: Readonly<{
    label?: ReactNode;
    description?: ReactNode;
    error?: ReactNode;
    name?: string;
    value?: string;
    type?: string;
    inputMode?: "decimal";
    "aria-invalid"?: true | undefined;
    onChange?: (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

// Mirrors the real Autocomplete surface the emitter binds: value-shaped
// (value: string, onChange: (value: string) => void), data accepting a
// readonly array, native label/description/error props, and onBlur (the
// real 9.x .d.ts is proven by the cli/matrix harness).
export declare const Autocomplete: (
  props: Readonly<{
    label?: ReactNode;
    description?: ReactNode;
    error?: ReactNode;
    name?: string;
    value?: string;
    data?: readonly string[];
    onChange?: (value: string) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

export declare const NativeSelect: (
  props: Readonly<{
    label?: ReactNode;
    description?: ReactNode;
    error?: ReactNode;
    name?: string;
    value?: string;
    onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
    onBlur?: () => void;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Switch: (
  props: Readonly<{
    label?: ReactNode;
    description?: ReactNode;
    name?: string;
    checked?: boolean;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

export declare const Box: (
  props: Readonly<{
    component?: string;
    onSubmit?: (event: Readonly<{ preventDefault: () => void }>) => unknown;
    maw?: number;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Stack: (
  props: StyleAttr &
    Readonly<{
      gap?: string;
      p?: string;
      bd?: string;
      bdrs?: string;
      children?: ReactNode;
    }>,
) => ReactElement;

export declare const SimpleGrid: (
  // Real v9 cols is StyleProp<number>: a number or a per-breakpoint object
  // ({ base, sm, ... }); the matrix verifies against the real declarations.
  props: StyleAttr &
    Readonly<{
      cols?: number | Readonly<Record<string, number>>;
      children?: ReactNode;
    }>,
) => ReactElement;

export declare const Title: (
  props: StyleAttr &
    Readonly<{ order?: 1 | 2 | 3 | 4 | 5 | 6; children?: ReactNode }>,
) => ReactElement;

export declare const Text: (
  props: Readonly<{ c?: string; role?: string; children?: ReactNode }>,
) => ReactElement;

export declare const Button: (
  props: Readonly<{
    type?: "button" | "submit" | "reset";
    variant?: "filled" | "light" | "outline" | "transparent" | "subtle" | "default";
    size?: string;
    disabled?: boolean;
    onClick?: () => void;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Card: (
  props: StyleAttr & Readonly<{ withBorder?: boolean; children?: ReactNode }>,
) => ReactElement;

export declare const Accordion: ((
  props: StyleAttr &
    Readonly<{
      defaultValue?: string;
      variant?: "default" | "contained" | "filled" | "separated";
      children?: ReactNode;
    }>,
) => ReactElement) &
  Readonly<{
    Item: (
      props: Readonly<{ value: string; children?: ReactNode }>,
    ) => ReactElement;
    Control: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
    Panel: (props: Readonly<{ children?: ReactNode }>) => ReactElement;
  }>;

export declare const NumberInput: (
  props: Readonly<{
    label?: ReactNode;
    error?: ReactNode;
    name?: string;
    value?: string | number;
    type?: string;
    "aria-invalid"?: true | undefined;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

export declare const Checkbox: (
  props: Readonly<{
    label?: ReactNode;
    error?: ReactNode;
    name?: string;
    checked?: boolean;
    type?: string;
    "aria-invalid"?: true | undefined;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

export declare const Select: (
  props: Readonly<{
    label?: ReactNode;
    error?: ReactNode;
    name?: string;
    value?: string;
    data?: readonly string[];
    "aria-invalid"?: true | undefined;
    onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

// Grid/Grid.Col: the span-capable layout pair multi-column sections emit.
// Only what the emitter writes is typed; the version matrix proves the
// output against the real @mantine/core declarations.
export declare const Grid: ((
  props: StyleAttr & Readonly<{ children?: ReactNode }>,
) => ReactElement) & {
  Col: (
    props: StyleAttr &
      Readonly<{
        span?: number | Readonly<Record<string, number>>;
        key?: string;
        children?: ReactNode;
      }>,
  ) => ReactElement;
};
