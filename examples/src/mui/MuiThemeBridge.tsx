import type { ReactNode } from "react";
import { ScopedCssBaseline } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// One theme instance for every MUI demo (module scope — a fresh theme per
// render would remount the whole emotion cache).
const muiDarkTheme = createTheme({ palette: { mode: "dark" } });

export type MuiThemeBridgeProps = Readonly<{ children: ReactNode }>;

// ScopedCssBaseline instead of CssBaseline: the global baseline would
// restyle the entire playground shell, the scoped one normalizes only the
// MUI subtree. Transparent background so the demo sits on the playground
// card instead of painting MUI's own canvas color over it.
export const MuiThemeBridge = ({ children }: MuiThemeBridgeProps) => (
  <ThemeProvider theme={muiDarkTheme}>
    <ScopedCssBaseline sx={{ bgcolor: "transparent" }}>
      {children}
    </ScopedCssBaseline>
  </ThemeProvider>
);
