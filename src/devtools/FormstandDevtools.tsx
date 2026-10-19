import { type ReactNode, useState } from "react";
import { isDevToolsBuild } from "../core/env";
import type { z } from "zod";
import type { Form } from "../core/createForm";
import type {
  DefaultPathDepth,
  FieldPath,
  PathDepth,
} from "../core/fieldPath";
import { getAtPath } from "../core/path";
import type { FormState } from "../core/types";
import { useFormSelectorShallow } from "../react/useFormSelector";
import { leafPaths, unmatchedErrorKeys } from "./paths";
import { type DevtoolsPosition, anchorFor, styles } from "./styles";

// D (the form's typed-path depth budget) is carried so a `pathDepth: 12`
// form is accepted: Form<S, 12> is deliberately not assignable to Form<S, 9>,
// so the depth-less prop type rejected every widened form (TS2375).
export type FormstandDevtoolsProps<
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
> = Readonly<{
  form: Form<TSchema, D>;
  position?: DevtoolsPosition;
  defaultOpen?: boolean;
  /** Shown on the toggle, for telling two mounted panels apart. */
  label?: string;
}>;

type FieldRow = Readonly<{
  path: string;
  value: unknown;
  error: readonly string[] | undefined;
  touched: boolean;
  dirty: boolean;
  isValidating: boolean;
}>;

// Non-production only, matching createForm's own devtools gate: the panel is
// a debugging affordance, and shipping it to end users would leak the whole
// form state into the page. Bundlers that define NODE_ENV drop the panel
// entirely. The gate fails CLOSED (isDevToolsBuild): a runtime with no
// readable NODE_ENV at all (a CDN/ESM consumer, Deno, a worker) renders
// nothing rather than assuming it is a dev build the way the console
// warnings may.

const preview = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (value instanceof Date) return value.toISOString();
  const json = JSON.stringify(value);
  // Long strings and big row objects would push the value column past the
  // panel; the full value is one expand away in the Values section.
  return json === undefined
    ? String(value)
    : json.length > 60
      ? `${json.slice(0, 57)}…`
      : json;
};

const flags = (row: FieldRow): string =>
  [
    row.touched ? "touched" : "",
    row.dirty ? "dirty" : "",
    row.isValidating ? "validating" : "",
  ]
    .filter((flag) => flag !== "")
    .join(" ");

// Reads every slice the panel renders in ONE shallow-compared subscription.
// Each member is a stored reference the form replaces on write, so shallow
// equality is stable — deriving anything fresh (an array from dirtyFields())
// inside the selector would hand the store a new reference every pass and
// loop it (React #185).
const useDevtoolsState = <TSchema extends z.ZodType, D extends PathDepth>(
  form: Form<TSchema, D>,
) =>
  useFormSelectorShallow(form, (state) => ({
    values: state.values,
    errors: state.errors,
    schemaErrors: state.schemaErrors,
    serverErrors: state.serverErrors,
    touched: state.touched,
    isValidating: state.isValidating,
    isSubmitting: state.isSubmitting,
    isValidatingForm: state.isValidatingForm,
    submitCount: state.submitCount,
    mode: state.mode,
  }));

const Section = ({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) => (
  <div style={styles.section}>
    <p style={styles.sectionTitle}>{title}</p>
    {children}
  </div>
);

const DevtoolsPanel = <TSchema extends z.ZodType, D extends PathDepth>({
  form,
  position = "bottom-right",
  defaultOpen = false,
  label = "formstand",
}: FormstandDevtoolsProps<TSchema, D>) => {
  const state = useDevtoolsState(form);
  const [open, setOpen] = useState(defaultOpen);
  const [held, setHeld] = useState<FormState<z.input<TSchema>> | null>(null);

  // Computed every render rather than memoized. getFieldState and diff() read
  // through `form`, not through anything in a dependency array, so a memo
  // would need deps the linter can't see and would go stale the moment one
  // was missed. This component only re-renders when the subscription above
  // reports a real change, so recomputing is both cheap and always right.
  const rows: readonly FieldRow[] = leafPaths(state.values).map((path) => {
    // Runtime-built strings need the cast the typed surface documents.
    // getFieldState rather than re-deriving dirty here, so the panel reports
    // the library's own comparison rules (Dates by timestamp, deep for
    // containers) instead of offering a second opinion.
    const field = form.getFieldState(path as FieldPath<z.input<TSchema>, D>);
    return {
      path,
      value: field.value,
      error: field.error,
      touched: field.touched,
      dirty: field.dirty,
      isValidating: field.isValidating,
    };
  });

  const orphanErrors = unmatchedErrorKeys(
    Object.keys(state.errors),
    rows.map((row) => row.path),
  );

  const diff = form.diff();

  return (
    <div style={{ ...styles.root, ...anchorFor(position) }}>
      {open ? (
        <div style={styles.panel}>
          <div style={styles.header}>
            <strong>{label}</strong>
            <span style={styles.muted}>
              {state.mode}
              {state.isSubmitting ? " · submitting" : ""}
              {state.isValidatingForm ? " · validating" : ""}
              {state.submitCount > 0 ? ` · submits ${state.submitCount}` : ""}
            </span>
            <button
              type="button"
              style={styles.button}
              onClick={() => setOpen(false)}
            >
              close
            </button>
          </div>

          <Section title={`fields (${rows.length})`}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: "38%" }}>path</th>
                  <th style={styles.th}>value</th>
                  <th style={{ ...styles.th, width: "26%" }}>state</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.path}>
                    <td style={{ ...styles.td, ...styles.path }}>{row.path}</td>
                    <td style={styles.td}>
                      {preview(row.value)}
                      {row.error === undefined ? null : (
                        <div style={styles.error}>{row.error.join(", ")}</div>
                      )}
                    </td>
                    <td style={{ ...styles.td, ...styles.flag }}>
                      {flags(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {orphanErrors.length === 0 ? null : (
            // Errors with no field of their own: the root "" key, array-level
            // messages, server verdicts on paths that hold no value yet.
            <Section title="errors without a field">
              {orphanErrors.map((key) => (
                <div key={key}>
                  <span style={styles.path}>{key === "" ? "(root)" : key}</span>{" "}
                  <span style={styles.error}>
                    {(state.errors[key] ?? []).join(", ")}
                  </span>
                </div>
              ))}
            </Section>
          )}

          <Section title="error channels">
            <div style={styles.muted}>
              schema {Object.keys(state.schemaErrors).length} · server{" "}
              {Object.keys(state.serverErrors).length}
            </div>
            {Object.entries(state.serverErrors).map(([key, messages]) => (
              <div key={key}>
                <span style={styles.path}>{key === "" ? "(root)" : key}</span>{" "}
                <span style={styles.error}>{messages.join(", ")}</span>{" "}
                <span style={styles.muted}>
                  {getAtPath(state.schemaErrors, key) === undefined
                    ? "(showing)"
                    : "(behind a schema error)"}
                </span>
              </div>
            ))}
          </Section>

          <Section title="diff vs initial">
            <pre style={styles.pre}>
              {Object.keys(diff).length === 0
                ? "clean"
                : JSON.stringify(diff, null, 2)}
            </pre>
          </Section>

          <Section title="time travel">
            <button
              type="button"
              style={styles.button}
              onClick={() => setHeld(form.snapshot())}
            >
              snapshot
            </button>{" "}
            <button
              type="button"
              style={styles.button}
              disabled={held === null}
              onClick={() => {
                if (held !== null) form.restore(held);
              }}
            >
              restore
            </button>{" "}
            <span style={styles.muted}>
              {held === null ? "nothing held" : "snapshot held"}
            </span>
          </Section>
        </div>
      ) : (
        <button
          type="button"
          style={styles.toggle}
          onClick={() => setOpen(true)}
        >
          {label}
          {Object.keys(state.errors).length > 0
            ? ` · ${String(Object.keys(state.errors).length)} err`
            : ""}
        </button>
      )}
    </div>
  );
};

/**
 * A form-aware debugging panel: every field's value, error, and flags, the
 * two error channels shown separately, the live diff against initial values,
 * and snapshot/restore time travel.
 *
 * Renders nothing in production builds, and nothing wherever NODE_ENV is not
 * readable (no `process` global, or one without NODE_ENV): the panel exposes
 * the whole form state, so an unknowable environment is treated as shipped.
 */
export const FormstandDevtools = <
  TSchema extends z.ZodType,
  D extends PathDepth = DefaultPathDepth,
>(
  props: FormstandDevtoolsProps<TSchema, D>,
) => (isDevToolsBuild() ? <DevtoolsPanel {...props} /> : null);
