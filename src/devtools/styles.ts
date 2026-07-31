import type { CSSProperties } from "react";

// Inline styles on purpose: a devtools panel that needs the consumer to
// import a stylesheet is a devtools panel that renders unstyled the first
// time someone tries it. Inline also means nothing here can leak into or be
// overridden by the host app's CSS, which matters when the whole job is
// showing you the truth about your form.

export type DevtoolsPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

const ANCHOR: Readonly<Record<DevtoolsPosition, CSSProperties>> = {
  "bottom-right": { bottom: 12, right: 12 },
  "bottom-left": { bottom: 12, left: 12 },
  "top-right": { top: 12, right: 12 },
  "top-left": { top: 12, left: 12 },
};

const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export const anchorFor = (position: DevtoolsPosition): CSSProperties =>
  ANCHOR[position];

export const styles = {
  root: {
    position: "fixed",
    zIndex: 2147483000,
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: 1.45,
    color: "#e6e6e6",
    colorScheme: "dark",
  } satisfies CSSProperties,
  toggle: {
    background: "#1b1b1f",
    border: "1px solid #3a3a42",
    color: "#e6e6e6",
    borderRadius: 6,
    padding: "6px 10px",
    font: "inherit",
    cursor: "pointer",
  } satisfies CSSProperties,
  panel: {
    width: "min(440px, calc(100vw - 24px))",
    maxHeight: "min(60vh, 520px)",
    overflow: "auto",
    background: "#141417",
    border: "1px solid #3a3a42",
    borderRadius: 8,
    boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 10px",
    borderBottom: "1px solid #2a2a31",
    position: "sticky",
    top: 0,
    background: "#141417",
  } satisfies CSSProperties,
  section: { padding: "8px 10px", borderBottom: "1px solid #23232a" },
  sectionTitle: {
    color: "#9aa0aa",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontSize: 10,
    margin: "0 0 6px",
  } satisfies CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  } satisfies CSSProperties,
  th: {
    textAlign: "left",
    color: "#9aa0aa",
    fontWeight: 400,
    padding: "2px 4px",
    borderBottom: "1px solid #2a2a31",
  } satisfies CSSProperties,
  td: {
    padding: "2px 4px",
    verticalAlign: "top",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  path: { color: "#c8b6ff" } satisfies CSSProperties,
  error: { color: "#ff8f8f" } satisfies CSSProperties,
  muted: { color: "#7d838d" } satisfies CSSProperties,
  flag: { color: "#7ddca4" } satisfies CSSProperties,
  pre: {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
  button: {
    background: "#22222a",
    border: "1px solid #3a3a42",
    color: "#e6e6e6",
    borderRadius: 5,
    padding: "3px 8px",
    font: "inherit",
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
