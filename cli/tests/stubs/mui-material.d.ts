// Minimal structural stand-in for @mui/material, mapped in via `paths` by the
// typecheck tests (the real package is not a dependency here). Deliberately
// narrow: it declares exactly the components and prop names the MUI emitter
// uses, typed with the adapter's shapes, so the generated MUI output is
// structurally typechecked instead of merely parsed — escaping or prop-name
// regressions fail the suite.
import type {
  ChangeEvent,
  ReactElement,
  ReactNode,
  SyntheticEvent,
} from "react";

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
    role?: string;
    sx?: SxProps;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Card: (
  props: Readonly<{
    variant?: "outlined" | "elevation";
    sx?: SxProps;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const CardHeader: (
  props: Readonly<{
    title?: ReactNode;
  }>,
) => ReactElement;

export declare const CardContent: (
  props: Readonly<{
    sx?: SxProps;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Accordion: (
  props: Readonly<{
    defaultExpanded?: boolean;
    disableGutters?: boolean;
    variant?: "outlined" | "elevation";
    sx?: SxProps;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const AccordionSummary: (
  props: Readonly<{
    expandIcon?: ReactNode;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const AccordionDetails: (
  props: Readonly<{
    sx?: SxProps;
    children?: ReactNode;
  }>,
) => ReactElement;

// Exported like the real package's TextFieldProps — the autocomplete
// override's renderInput casts its params through it.
export type TextFieldProps = Readonly<{
  fullWidth?: boolean;
  select?: boolean;
  type?: string;
  label?: ReactNode;
  name?: string;
  value?: unknown;
  error?: boolean;
  helperText?: ReactNode;
  slotProps?: Readonly<{
    input?: Readonly<Record<string, unknown>>;
    inputLabel?: Readonly<Record<string, unknown>>;
  }>;
  onChange?: TextChangeHandler;
  onBlur?: () => void;
  children?: ReactNode;
}>;

export declare const TextField: (props: TextFieldProps) => ReactElement;

// Mirrors the real Autocomplete surface the emitter binds (freeSolo with a
// controlled INPUT value — inputValue/onInputChange — options as a readonly
// array, onBlur on the root, renderInput receiving spreadable params; the
// real .d.ts is proven by the cli/matrix harness).
export type AutocompleteRenderInputParams = Readonly<{
  id: string;
  disabled: boolean;
  fullWidth: boolean;
}>;

export declare const Autocomplete: (
  props: Readonly<{
    fullWidth?: boolean;
    freeSolo?: boolean;
    options: readonly string[];
    inputValue?: string;
    onInputChange?: (event: SyntheticEvent, value: string) => void;
    onBlur?: () => void;
    renderInput: (params: AutocompleteRenderInputParams) => ReactNode;
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
