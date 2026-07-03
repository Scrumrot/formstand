import type { ErrorMap } from "../core/types";
import { isPathOrChild } from "../core/validation";

// Focus the first form control (in DOM order) whose `name` attribute matches
// an entry in the error map — either exactly, or as a descendant of an
// errored container path, so array-level errors ("lineItems" from
// z.array().min()), object-level refines ("address"), and the root "" key
// land on their first rendered field. The bound components and prop builders
// set name={path}, so this works out of the box:
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
    (k) => (errors[k]?.length ?? 0) > 0,
  );
  const target = [
    ...scope.querySelectorAll<HTMLElement>(
      "input[name], select[name], textarea[name]",
    ),
  ].find((el) => {
    const name = el.getAttribute("name");
    return name !== null && erroredPaths.some((k) => isPathOrChild(name, k));
  });
  target?.focus();
  return target !== undefined;
};
