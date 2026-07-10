import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Light/dark theming for the playground shell. The mode lives on
// <html data-theme="..."> so plain CSS (styles.css variables, the shadcn
// scope) and React (MuiThemeBridge) read one source of truth.

export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "fs-theme";

const storedMode = (): ThemeMode | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
};

export const initialThemeMode = (): ThemeMode =>
  storedMode() ??
  (typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark");

const ThemeModeContext = createContext<ThemeMode>("dark");

export const useThemeMode = (): ThemeMode => useContext(ThemeModeContext);

export type ThemeModeProviderProps = Readonly<{
  mode: ThemeMode;
  children: ReactNode;
}>;

export const ThemeModeProvider = ({ mode, children }: ThemeModeProviderProps) => (
  <ThemeModeContext.Provider value={mode}>{children}</ThemeModeContext.Provider>
);

// The App-level state hook: owns the mode, mirrors it onto <html> and
// localStorage.
export const useThemeModeState = () => {
  const [mode, setMode] = useState<ThemeMode>(initialThemeMode);
  useEffect(() => {
    document.documentElement.dataset["theme"] = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Private-mode storage failures just lose persistence.
    }
  }, [mode]);
  const toggle = () =>
    setMode((current) => (current === "dark" ? "light" : "dark"));
  return { mode, toggle };
};

// The repo's star count for the GitHub link — best-effort decoration:
// cached per session, silent on any failure, and skipped entirely under
// vitest so CI never talks to the GitHub API.
export const useGitHubStars = (repo: string): number | null => {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    if (import.meta.env?.["VITEST"] !== undefined) return;
    try {
      const cached = sessionStorage.getItem(`fs-stars:${repo}`);
      if (cached !== null && Number.isFinite(Number(cached))) {
        setStars(Number(cached));
        return;
      }
    } catch {
      // fall through to the fetch
    }
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${repo}`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const count = (data as Readonly<{ stargazers_count?: unknown }> | null)
          ?.stargazers_count;
        if (typeof count === "number") {
          setStars(count);
          try {
            sessionStorage.setItem(`fs-stars:${repo}`, String(count));
          } catch {
            // decoration only
          }
        }
      })
      .catch(() => {
        // decoration only — the link works without a count
      });
    return () => controller.abort();
  }, [repo]);
  return stars;
};
