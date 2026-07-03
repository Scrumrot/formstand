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
// Pass `root` to scope the search (e.g. the <form> element). Returns whether
// a control was focused. Safe to import during SSR — it only touches the DOM
// when called.
export const focusFirstError = (
  errors: ErrorMap,
  root?: ParentNode,
): boolean => {
  const scope = root ?? document;
  const erroredPaths = Object.keys(errors).filter(
    (k) => k !== "" && (errors[k]?.length ?? 0) > 0,
  );
  const hasRootError = (errors[""]?.length ?? 0) > 0;
  // Hidden and disabled controls can't take focus — without the filter, a
  // leading <input type="hidden" name="csrf"> would swallow the root
  // fallback (focus() no-ops but the function would still report success).
  const controls = [
    ...scope.querySelectorAll<HTMLElement>(
      "input[name], select[name], textarea[name]",
    ),
  ].filter((el) => !el.matches(':disabled, [type="hidden"]'));
  const fieldMatch = controls.find((el) => {
    const name = el.getAttribute("name");
    return name !== null && erroredPaths.some((k) => isPathOrChild(name, k));
  });
  const target = fieldMatch ?? (hasRootError ? controls[0] : undefined);
  target?.focus();
  return target !== undefined;
};
