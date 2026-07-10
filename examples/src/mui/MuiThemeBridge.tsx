import type { ReactNode } from "react";
import { ScopedCssBaseline } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useThemeMode } from "../theme";

// One theme instance per mode (module scope — a fresh theme per render
// would remount the whole emotion cache). The bridge follows the shell's
// light/dark switch via ThemeModeContext.
const themes = {
  dark: createTheme({ palette: { mode: "dark" } }),
  light: createTheme({ palette: { mode: "light" } }),
} as const;

export type MuiThemeBridgeProps = Readonly<{ children: ReactNode }>;

// ScopedCssBaseline instead of CssBaseline: the global baseline would
// restyle the entire playground shell, the scoped one normalizes only the
// MUI subtree. Transparent background so the demo sits on the playground
// card instead of painting MUI's own canvas color over it.
export const MuiThemeBridge = ({ children }: MuiThemeBridgeProps) => {
  const mode = useThemeMode();
  return (
    <ThemeProvider theme={themes[mode]}>
      <ScopedCssBaseline sx={{ bgcolor: "transparent" }}>
        {children}
      </ScopedCssBaseline>
    </ThemeProvider>
  );
};
