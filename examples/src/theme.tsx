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

// VitePress's own storage key: the docs site and the playground share an
// origin, so using the same key makes the theme ONE preference across both
// surfaces: flip it on either side and the other follows, no sync code.
// VitePress also stores "auto" (follow the OS); we treat that like unset.
const STORAGE_KEY = "vitepress-theme-appearance";
const LEGACY_KEY = "fs-theme";

const storedMode = (): ThemeMode | null => {
  try {
    const value =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
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

// The App-level state hook: owns the mode and mirrors it onto <html>.
// localStorage is written ONLY when the user toggles: the key is shared
// with the docs site, where "auto" (follow the OS) is a valid stored
// choice, and a write on every mount used to overwrite a visitor's "auto"
// with whatever the OS resolved to the moment the playground opened.
export const useThemeModeState = () => {
  const [mode, setMode] = useState<ThemeMode>(initialThemeMode);
  useEffect(() => {
    document.documentElement.dataset["theme"] = mode;
  }, [mode]);
  const toggle = () =>
    setMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private-mode storage failures just lose persistence.
      }
      return next;
    });
  return { mode, toggle };
};

const starsKey = (repo: string): string => `fs-stars:${repo}`;

// The per-session cache read, done once as the initial state so the effect
// below never sets state synchronously on mount (which React's hooks lint
// flags: it forces a second render for a value already known at the first).
const cachedStars = (repo: string): number | null => {
  try {
    const cached = sessionStorage.getItem(starsKey(repo));
    return cached !== null && Number.isFinite(Number(cached))
      ? Number(cached)
      : null;
  } catch {
    return null;
  }
};

// The repo's star count for the GitHub link. Best-effort decoration:
// cached per session, silent on any failure, and skipped entirely under
// vitest so CI never talks to the GitHub API.
export const useGitHubStars = (repo: string): number | null => {
  const [stars, setStars] = useState<number | null>(() => cachedStars(repo));
  useEffect(() => {
    if (import.meta.env?.["VITEST"] !== undefined) return;
    if (cachedStars(repo) !== null) return;
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
            sessionStorage.setItem(starsKey(repo), String(count));
          } catch {
            // decoration only
          }
        }
      })
      .catch(() => {
        // decoration only; the link works without a count
      });
    return () => controller.abort();
  }, [repo]);
  return stars;
};
