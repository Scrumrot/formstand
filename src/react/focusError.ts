import type { ErrorMap } from "../core/types";
import { isPathOrChild } from "../core/validation";

// Focus the first form control (in DOM order) whose `name` attribute matches
// an entry in the error map — either exactly, or as a descendant of an
// errored container path, so array-level errors ("lineItems" from
// z.array().min()) and object-level refines ("address") land on their first
// rendered field. Most specific wins: the root "" key (a form-wide refine)
// falls back to the first control only when no field-keyed error matches
// anything — otherwise a root error would steal focus from the actually
// errored field. The bound components and prop builders set name={path}, so
// this works out of the box:
//
//   form.handleSubmit(onValid, (errors) => focusFirstError(errors))
//
// Pass `root` to scope the search (e.g. the <form> element via a ref) — on a
// page with several forms this is the way to keep focus inside YOUR form:
// without it the search spans the whole document, and the root-"" fallback
// refuses to guess between forms (it returns false when the document holds
// more than one <form>). Returns whether a control actually received focus —
// candidates that can't take it (disabled, hidden, inside a closed <dialog>,
// display:none, ...) are passed over for the next match in DOM order. Safe to
// import during SSR — it only touches the DOM when called.
export const focusFirstError = (
  errors: ErrorMap,
  root?: ParentNode,
): boolean => {
  const scope = root ?? document;
  const erroredPaths = Object.keys(errors).filter(
    (k) => k !== "" && (errors[k]?.length ?? 0) > 0,
  );
  const hasRootError = (errors[""]?.length ?? 0) > 0;
  // Hidden and disabled controls, and controls inside a closed <dialog>,
  // can't take focus — without the filter, a leading
  // <input type="hidden" name="csrf"> would swallow the root fallback, and a
  // name match inside a not-yet-opened dialog would shadow the visible one.
  const controls = [
    ...scope.querySelectorAll<HTMLElement>(
      "input[name], select[name], textarea[name]",
    ),
  ].filter(
    (el) =>
      !el.matches(':disabled, [type="hidden"]') &&
      el.closest("dialog:not([open])") === null,
  );
  const fieldMatches = controls.filter((el) => {
    const name = el.getAttribute("name");
    return name !== null && erroredPaths.some((k) => isPathOrChild(name, k));
  });
  // The root-"" fallback ("focus the first control") is only meaningful when
  // "first control" is unambiguous. With the default document scope on a
  // page holding several <form>s, the first control could belong to a form
  // that had nothing to do with this submit — refuse to guess and report
  // false; pass the form element as `root` to disambiguate.
  const rootFallbackApplies =
    hasRootError &&
    (root !== undefined || document.querySelectorAll("form").length <= 1);
  const candidates =
    fieldMatches.length > 0 ? fieldMatches : rootFallbackApplies ? controls : [];
  // focus() can silently no-op (display:none ancestors and other
  // unfocusable states the cheap filters above can't see) — verify it took,
  // and fall through to the next candidate in DOM order. True only when a
  // control actually holds focus.
  return candidates.some((el) => {
    el.focus();
    return document.activeElement === el;
  });
};
