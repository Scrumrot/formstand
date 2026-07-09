// Minimal structural stand-in for @mui/material, mapped in via `paths` by the
// typecheck tests (the real package is not a dependency here). Deliberately
// narrow: it declares exactly the components and prop names the MUI emitter
// uses, typed with the adapter's shapes, so the generated MUI output is
// structurally typechecked instead of merely parsed — escaping or prop-name
// regressions fail the suite.
import type { ChangeEvent, ReactElement, ReactNode } from "react";

type SxProps = Readonly<Record<string, unknown>>;

type TextChangeHandler = (
  event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
) => void;

export declare const Box: (
  props: Readonly<{
    component?: string;
    sx?: SxProps;
    onSubmit?: (event: Readonly<{ preventDefault: () => void }>) => unknown;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Button: (
  props: Readonly<{
    type?: "button" | "submit" | "reset";
    variant?: "text" | "outlined" | "contained";
    disabled?: boolean;
    onClick?: () => void;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Stack: (
  props: Readonly<{
    spacing?: number;
    sx?: SxProps;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Typography: (
  props: Readonly<{
    variant?: string;
    color?: string;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const TextField: (
  props: Readonly<{
    fullWidth?: boolean;
    select?: boolean;
    label?: ReactNode;
    name?: string;
    value?: unknown;
    error?: boolean;
    helperText?: ReactNode;
    slotProps?: Readonly<{ input?: Readonly<Record<string, unknown>> }>;
    onChange?: TextChangeHandler;
    onBlur?: () => void;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const MenuItem: (
  props: Readonly<{
    value?: string;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const FormControlLabel: (
  props: Readonly<{
    label?: ReactNode;
    control: ReactElement;
  }>,
) => ReactElement;

export declare const Switch: (
  props: Readonly<{
    name?: string;
    checked?: boolean;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;
