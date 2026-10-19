import type { ReactNode } from "react";
import { ChakraProvider, createSystem, defaultConfig } from "@chakra-ui/react";
import { ChakraOnboardingForm } from "../generated/ChakraOnboardingForm";
import { useThemeMode } from "../theme";

// The Chakra kit demo and its provider bridge, in one module so that
// @chakra-ui/react (and the generated form) load with the "Gen: Chakra UI"
// tab instead of riding in the main chunk; App.tsx imports this file
// through React.lazy only.
//
// Chakra v3's default system injects UNSCOPED global CSS (`*`/body/html
// preflight resets plus defaultConfig's globalCss: placeholder and
// selection colors, html color-scheme) that would restyle the whole
// playground shell while the tab is mounted, so the bridge builds its own
// system with BOTH layers scoped under .chakra-scope (the same scoping
// pattern as the shadcn tabs) and puts that class on the wrapper. Root
// selectors (html/body/:root) become the scope element itself; everything
// else nests under it. The scoping regression test asserts this through
// ChakraBridge (rendering it and inspecting the injected CSS), so nothing
// here needs exporting beyond the bridge and the demo.
const scopeSelector = (selector: string): string =>
  selector
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      return trimmed === "html" || trimmed === "body" || trimmed === ":root"
        ? ".chakra-scope"
        : `.chakra-scope ${trimmed}`;
    })
    .join(", ");

const chakraScopedSystem = createSystem(
  {
    ...defaultConfig,
    globalCss: Object.fromEntries(
      Object.entries(defaultConfig.globalCss ?? {}).map(
        ([selector, styles]) => [scopeSelector(selector), styles],
      ),
    ),
  },
  { preflight: { scope: ".chakra-scope" } },
);

export type ChakraBridgeProps = Readonly<{ children: ReactNode }>;

// Follows the shell's light/dark switch the way MuiThemeBridge does, and
// wraps only the demo content so Chakra's theming never leaks into the
// playground shell.
export const ChakraBridge = ({ children }: ChakraBridgeProps) => {
  const mode = useThemeMode();
  return (
    <ChakraProvider value={chakraScopedSystem}>
      <div className={`chakra-scope ${mode}`}>{children}</div>
    </ChakraProvider>
  );
};

// Single-file layout: useForm lives inside the generated component, so
// there is no form instance to register with useDemoForm (the View state
// button stays disabled, like the other single-file generated tabs).
export const ChakraOnboardingDemo = () => (
  <ChakraBridge>
    <ChakraOnboardingForm />
  </ChakraBridge>
);
