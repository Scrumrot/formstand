// Minimal structural stand-in for antd (v6), mapped in via `paths` by the
// --ui antd backend tests (the real package is not a dependency here; the
// REAL 6.x declarations are exercised by the cli/matrix harness).
// Deliberately narrow: exactly the controls the antd backend emits, each
// prop typed to the adapter's output — including the two decisions the
// backend encodes: Select's onChange is VALUE-shaped (antd has no native
// <select>; a DOM ChangeEvent handler must not compile against it), and
// Checkbox's onChange takes antd's own CheckboxChangeEvent (e.target.checked)
// — so the generated output is structurally typechecked, not merely parsed.
import type {
  CSSProperties,
  ChangeEvent,
  FocusEventHandler,
  ReactElement,
  ReactNode,
} from "react";

export declare const Input: (
  props: Readonly<{
    id?: string;
    name?: string;
    value?: string;
    type?: string;
    inputMode?: "decimal";
    status?: "error" | "warning" | "" | undefined;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
  }>,
) => ReactElement;

// antd's own change event: DOM-ish (target.checked), but not a React
// ChangeEvent — mirrors antd/es/checkbox's CheckboxChangeEvent.
export type CheckboxChangeEvent = Readonly<{
  target: Readonly<{ checked: boolean }>;
  stopPropagation: () => void;
  preventDefault: () => void;
}>;

export declare const Checkbox: (
  props: Readonly<{
    name?: string;
    checked?: boolean;
    onChange?: (event: CheckboxChangeEvent) => void;
    onBlur?: FocusEventHandler<HTMLInputElement>;
    children?: ReactNode;
  }>,
) => ReactElement;

// Value-shaped, like the real combobox: no DOM event, no `name` prop (antd's
// Select renders no form-posting input), value may be null (placeholder).
export declare const Select: (
  props: Readonly<{
    id?: string;
    placeholder?: ReactNode;
    options?: readonly Readonly<{ value: string; label: ReactNode }>[];
    value?: string | null;
    status?: "error" | "warning" | "" | undefined;
    onChange?: (value: string) => void;
    onBlur?: FocusEventHandler<HTMLElement>;
  }>,
) => ReactElement;

// Value-shaped like Select, but the value is the free TEXT (an input-backed
// combobox): options carry { value } only, no `name` prop exists (no
// form-posting input — same focus-helper caveat as Select), and "" is the
// empty state (the real 6.x .d.ts is proven by the cli/matrix harness).
export declare const AutoComplete: (
  props: Readonly<{
    id?: string;
    options?: readonly Readonly<{ value: string }>[];
    value?: string;
    status?: "error" | "warning" | "" | undefined;
    onChange?: (value: string) => void;
    onBlur?: FocusEventHandler<HTMLElement>;
  }>,
) => ReactElement;

export declare const Typography: Readonly<{
  Title: (
    props: Readonly<{
      level?: 1 | 2 | 3 | 4 | 5;
      style?: CSSProperties;
      children?: ReactNode;
    }>,
  ) => ReactElement;
  Text: (
    props: Readonly<{
      type?: "secondary" | "success" | "warning" | "danger";
      role?: string;
      children?: ReactNode;
    }>,
  ) => ReactElement;
}>;

export declare const Flex: (
  props: Readonly<{
    vertical?: boolean;
    gap?: "small" | "middle" | "large" | number;
    style?: CSSProperties;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Card: (
  props: Readonly<{
    variant?: "outlined" | "borderless";
    style?: CSSProperties;
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Collapse: (
  props: Readonly<{
    defaultActiveKey?: readonly string[];
    style?: CSSProperties;
    items?: readonly Readonly<{
      key: string;
      label?: ReactNode;
      children?: ReactNode;
    }>[];
  }>,
) => ReactElement;

export declare const Button: (
  props: Readonly<{
    htmlType?: "button" | "submit" | "reset";
    type?: "default" | "primary" | "dashed" | "link" | "text";
    size?: "small" | "middle" | "large";
    disabled?: boolean;
    onClick?: () => void;
    children?: ReactNode;
  }>,
) => ReactElement;

// Row/Col: the 24-column layout pair the multi-column sections emit. The
// real props are far wider; only what the emitter writes is typed, and the
// version matrix proves the output against the real antd declarations.
export declare const Row: (
  props: Readonly<{
    gutter?: number | readonly [number, number];
    children?: ReactNode;
  }>,
) => ReactElement;

export declare const Col: (
  props: Readonly<{
    span?: number;
    xs?: number;
    sm?: number;
    md?: number;
    key?: string;
    children?: ReactNode;
  }>,
) => ReactElement;
