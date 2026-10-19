import type { ReactNode } from "react";
import { ConfigProvider as AntdConfigProvider, theme as antdTheme } from "antd";
import { AntdOnboardingForm } from "../generated/AntdOnboardingForm";
import { useThemeMode } from "../theme";

export type AntdBridgeProps = Readonly<{ children: ReactNode }>;

// antd needs no provider to function; ConfigProvider here is purely the
// optional theming hook, swapping the token algorithm for dark mode. Lives
// in its own module so antd loads with the "Gen: Ant Design" tab only.
export const AntdBridge = ({ children }: AntdBridgeProps) => {
  const mode = useThemeMode();
  return (
    <AntdConfigProvider
      theme={{
        algorithm:
          mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      {children}
    </AntdConfigProvider>
  );
};

// Single-file layout: no form instance to register with useDemoForm (see
// ChakraOnboardingDemo).
export const AntdOnboardingDemo = () => (
  <AntdBridge>
    <AntdOnboardingForm />
  </AntdBridge>
);
