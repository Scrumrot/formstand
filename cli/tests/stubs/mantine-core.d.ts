// Minimal structural stand-in for @mantine/core, mapped in via `paths` by the
// custom-template typecheck test (the real package is not a dependency here).
// Deliberately narrow: exactly the controls a Mantine template spreads the
// formstand prop builders onto, each prop typed to accept the builder output
// (name/value/checked/onChange/onBlur/aria-invalid/type) plus the label, error,
// and data props a template writes explicitly — so the generated output is
// structurally typechecked, not merely parsed.
import type { ChangeEvent, ReactElement, ReactNode } from "react";

export declare const TextInput: (
  props: Readonly<{
    label?: ReactNode;
    error?: ReactNode;
    name?: string;
    value?: string;
    type?: string;
    "aria-invalid"?: true | undefined;
    onChange?: (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

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
