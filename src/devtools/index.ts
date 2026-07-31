// formstand/devtools — an in-page, form-aware debugging panel.
//
// Separate from the main entry on purpose: this pulls in UI, and the main
// entry stays importable by anything that only wants form state. The panel
// renders null in production builds either way.
export {
  FormstandDevtools,
  type FormstandDevtoolsProps,
} from "./FormstandDevtools";
export type { DevtoolsPosition } from "./styles";

// The path walk behind the fields table, exported because it is the one
// piece with interesting behaviour (empty containers are leaves, array rows
// get a path each) and is worth testing or reusing in a custom panel.
export { leafPaths, unmatchedErrorKeys } from "./paths";
