import type { ErrorMap } from "../core/types";

// Focus the first form control (in DOM order) whose `name` attribute has an
// entry in the error map. The bound components and prop builders set
// name={path}, so this works out of the box:
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
  const target = [
    ...scope.querySelectorAll<HTMLElement>(
      "input[name], select[name], textarea[name]",
    ),
  ].find((el) => {
    const name = el.getAttribute("name");
    return name !== null && (errors[name]?.length ?? 0) > 0;
  });
  target?.focus();
  return target !== undefined;
};
