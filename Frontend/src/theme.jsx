import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";

export const THEME_STORAGE_KEY = "flame-theme";
const THEMES = new Set(["light", "dark"]);

function canUseDOM() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function getStoredThemePreference() {
  if (!canUseDOM()) return "";
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.has(value) ? value : "";
  } catch {
    return "";
  }
}

export function hasStoredThemePreference() {
  return Boolean(getStoredThemePreference());
}

function systemTheme() {
  if (!canUseDOM() || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolvePreferredTheme() {
  return getStoredThemePreference() || systemTheme();
}

export function applyThemeToDocument(theme) {
  if (!canUseDOM()) return;
  const safeTheme = THEMES.has(theme) ? theme : "dark";
  document.documentElement.dataset.theme = safeTheme;
  document.documentElement.style.colorScheme = safeTheme;
}

applyThemeToDocument(resolvePreferredTheme());

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(resolvePreferredTheme);

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useLayoutEffect(() => {
    if (!canUseDOM() || !window.matchMedia || hasStoredThemePreference()) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => setThemeState(media.matches ? "light" : "dark");
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  const setTheme = useCallback((nextTheme, options = {}) => {
    const safeTheme = THEMES.has(nextTheme) ? nextTheme : "dark";
    const persist = options.persist !== false;
    setThemeState(safeTheme);
    applyThemeToDocument(safeTheme);
    if (persist && canUseDOM()) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
      } catch {
        // Theme persistence should never block the UI.
      }
    }
  }, []);

  const setLight = useCallback(
    (nextLight, options) => {
      setTheme(nextLight ? "light" : "dark", options);
    },
    [setTheme]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [setTheme, theme]);

  const syncFromServer = useCallback(
    (serverLight) => {
      if (hasStoredThemePreference()) return;
      setLight(Boolean(serverLight), { persist: false });
    },
    [setLight]
  );

  const value = useMemo(
    () => ({
      theme,
      light: theme === "light",
      setTheme,
      setLight,
      toggleTheme,
      syncFromServer
    }),
    [setLight, setTheme, syncFromServer, theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }
  return context;
}
