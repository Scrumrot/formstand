import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
// Mantine's global stylesheet (component classes + the CSS variables the
// provider fills in), in the @layer variant on purpose. It loads with this
// lazily imported tab, AFTER the shell's own app.css, and the stylesheet
// carries unscoped `body`/`:root` rules (font, background-color, color)
// that would then win every tie against the shell. Wrapping everything in
// `@layer mantine` makes the order irrelevant: styles.css is unlayered by
// design, and unlayered rules beat any layered rule regardless of source
// order. The unlayered styles.css used to be imported globally from
// main.tsx (before app.css) for exactly this reason, at 568 kB of CSS
// for one tab.
import "@mantine/core/styles.layer.css";
import { MantineOnboardingForm } from "../generated/MantineOnboardingForm";
import { useThemeMode } from "../theme";

export type MantineBridgeProps = Readonly<{ children: ReactNode }>;

// Mantine takes the scheme as a prop; component classes are inert until
// this provider mounts, so the stylesheet above costs nothing to other tabs.
export const MantineBridge = ({ children }: MantineBridgeProps) => {
  const mode = useThemeMode();
  return <MantineProvider forceColorScheme={mode}>{children}</MantineProvider>;
};

// Single-file layout: no form instance to register with useDemoForm (see
// ChakraOnboardingDemo).
export const MantineOnboardingDemo = () => (
  <MantineBridge>
    <MantineOnboardingForm />
  </MantineBridge>
);
