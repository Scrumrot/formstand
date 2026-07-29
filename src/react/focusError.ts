import type { ErrorMap } from "../core/types";
import { isPathOrChild } from "../core/validation";

// The shared candidate walk for focusFirstError/focusField: form controls
// with a `name`, in DOM order. Focusability is a SEPARATE, later filter —
// matches()/closest() are ancestor walks, so they run on the few
// name-matched candidates instead of every named control in the document
// (a failed submit on a page with hundreds of controls shouldn't pay
// hundreds of DOM traversals to focus one input).
const namedControls = (scope: ParentNode): readonly HTMLElement[] => [
  ...scope.querySelectorAll<HTMLElement>(
    "input[name], select[name], textarea[name]",
  ),
];

// Hidden and disabled controls, and controls inside a closed <dialog>,
// can't take focus — without the filter, a leading <input type="hidden"
// name="csrf"> would swallow focusFirstError's root fallback, and a name
// match inside a not-yet-opened dialog would shadow the visible one.
const isFocusCandidate = (el: HTMLElement): boolean =>
  !el.matches(':disabled, [type="hidden"]') &&
  el.closest("dialog:not([open])") === null;

// Does `el` actually hold focus? Ask the element's OWN root (document or
// shadow root): document.activeElement retargets to the shadow HOST for a
// focused control inside a shadow root, so it would read a successfully
// focused shadow-DOM control as unfocused. A root that is neither (a
// detached fragment) has no activeElement — fall back to the document,
// where a detached element can never be the active one.
const holdsFocus = (el: HTMLElement): boolean => {
  const rootNode = el.getRootNode();
  const active =
    rootNode instanceof Document || rootNode instanceof ShadowRoot
      ? rootNode.activeElement
      : document.activeElement;
  return active === el;
};

// focus() can silently no-op (display:none ancestors and other unfocusable
// states the cheap filters above can't see) — verify it took, and fall
// through to the next candidate in DOM order. True only when a control
// actually holds focus.
const focusFirstOf = (candidates: readonly HTMLElement[]): boolean =>
  candidates.some((el) => {
    el.focus();
    return holdsFocus(el);
  });

const nameMatchesAny = (
  el: HTMLElement,
  paths: readonly string[],
): boolean => {
  const name = el.getAttribute("name");
  return name !== null && paths.some((p) => isPathOrChild(name, p));
};

// CSS attribute-selector value for an arbitrary path: quoted, with the two
// characters that are active inside a double-quoted CSS string escaped —
// so paths with dots ("address.region") and hostile names select literally.
const cssQuoted = (value: string): string =>
  `"${value.replace(/[\\"]/g, (ch) => `\\${ch}`)}"`;

// The id fallback for composite widgets that render no `name` at all (e.g.
// antd's Select — no form-posting input exists in it) but DO forward
// `id={path}` to their real focusable control, the way the CLI's antd
// adapter emits it. EXACT id match only, by design: descendant semantics
// ("address" covering "address.city") belong to the name walk — an id names
// one element, and inventing prefix matching over ids would guess. Runs
// through the same focusability filter and post-focus verification as name
// matches.
const idMatches = (
  scope: ParentNode,
  path: string,
): readonly HTMLElement[] =>
  path === ""
    ? []
    : [...scope.querySelectorAll<HTMLElement>(`[id=${cssQuoted(path)}]`)];

// Document order for a merged candidate list (name matches + id fallbacks
// come from separate queries, but "first error" means first in the DOM).
const inDomOrder = (
  els: readonly HTMLElement[],
): readonly HTMLElement[] =>
  [...els].sort((a, b) =>
    a === b
      ? 0
      : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        ? -1
        : 1,
  );

// The candidate walk shared by focusFirstError and focusField: name-matched
// form controls for every path, plus — per path that matched NO named
// control — the element whose `id` is exactly that path. Paths with a named
// match never consult ids, so the name walk's semantics (descendants
// included) stay authoritative wherever a `name` exists.
const pathCandidates = (
  scope: ParentNode,
  paths: readonly string[],
): readonly HTMLElement[] => {
  const controls = namedControls(scope);
  const named = controls.filter((el) => nameMatchesAny(el, paths));
  const unnamedPaths = paths.filter(
    (p) => !controls.some((el) => nameMatchesAny(el, [p])),
  );
  const byId = unnamedPaths.flatMap((p) => idMatches(scope, p));
  return inDomOrder([...new Set([...named, ...byId])]);
};

// Focus the first form control (in DOM order) whose `name` attribute matches
// an entry in the error map — either exactly, or as a descendant of an
// errored container path, so array-level errors ("lineItems" from
// z.array().min()) and object-level refines ("address") land on their first
// rendered field. Most specific wins: the root "" key (a form-wide refine)
// falls back to the first control only when no field-keyed error matches
// anything — otherwise a root error would steal focus from the actually
// errored field. A path that matches NO named control at all additionally
// tries the element whose `id` is exactly that path (see pathCandidates) —
// how composite widgets with no `name` anywhere, like antd's Select with
// id={path}, still get focused. The bound components and prop builders set
// name={path}, so this works out of the box:
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
  const controls = namedControls(scope);
  const fieldMatches = pathCandidates(scope, erroredPaths).filter(
    isFocusCandidate,
  );
  // The root-"" fallback ("focus the first control") is only meaningful when
  // "first control" is unambiguous. With the default document scope on a
  // page holding several <form>s, the first control could belong to a form
  // that had nothing to do with this submit — refuse to guess and report
  // false; pass the form element as `root` to disambiguate.
  const rootFallbackApplies =
    hasRootError &&
    (root !== undefined || document.querySelectorAll("form").length <= 1);
  const candidates =
    fieldMatches.length > 0
      ? fieldMatches
      : rootFallbackApplies
        ? controls.filter(isFocusCandidate)
        : [];
  return focusFirstOf(candidates);
};

// Imperative sibling of focusFirstError, keyed by a path instead of an error
// map: focus the first control (in DOM order) whose `name` is `path` itself
// or a descendant of it — focusField("address") lands on the first rendered
// address field. Same candidate walk (unfocusable controls are passed over,
// focus is verified to have taken, a name-less path falls back to the
// element whose `id` is exactly the path) and the same `root` scoping.
// This is the "setFocus" of the library — reach for it after opening a
// dialog or appending an array row:
//
//   items.push(emptyItem);
//   requestAnimationFrame(() =>
//     focusField(`items.${items.length}.name`, formRef.current ?? undefined),
//   );
//
// The root "" path is whole-form scope, consistent with the imperative
// surface (validateField("") / resetField("")): focus the first focusable
// control in scope. Like focusFirstError's root-"" fallback, "first control"
// under the default document scope is a guess when the page holds several
// <form>s — focusField refuses to guess and returns false; pass the form
// element as `root` to disambiguate.
//
// Returns whether a control actually received focus. Safe to import during
// SSR — it only touches the DOM when called.
export const focusField = (path: string, root?: ParentNode): boolean => {
  const scope = root ?? document;
  return path === ""
    ? (root !== undefined ||
        document.querySelectorAll("form").length <= 1) &&
        focusFirstOf(namedControls(scope).filter(isFocusCandidate))
    : focusFirstOf(pathCandidates(scope, [path]).filter(isFocusCandidate));
};
