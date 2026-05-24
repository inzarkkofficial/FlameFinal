import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";

export const THEME_STORAGE_KEY = "flame-theme";
const DARK_THEME = "dark";

function canUseDOM() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function getStoredThemePreference() {
  return DARK_THEME;
}

export function hasStoredThemePreference() {
  return true;
}

export function resolvePreferredTheme() {
  return DARK_THEME;
}

export function applyThemeToDocument() {
  if (!canUseDOM()) return;
  document.documentElement.dataset.theme = DARK_THEME;
  document.documentElement.style.colorScheme = DARK_THEME;
}

applyThemeToDocument();

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(DARK_THEME);

  useLayoutEffect(() => {
    applyThemeToDocument();
    if (canUseDOM()) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, DARK_THEME);
      } catch {
        // Theme persistence should never block the UI.
      }
    }
  }, [theme]);

  const setTheme = useCallback((_nextTheme, options = {}) => {
    const persist = options.persist !== false;
    setThemeState(DARK_THEME);
    applyThemeToDocument();
    if (persist && canUseDOM()) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, DARK_THEME);
      } catch {
        // Theme persistence should never block the UI.
      }
    }
  }, []);

  const setLight = useCallback(
    (_nextLight, options) => {
      setTheme(DARK_THEME, options);
    },
    [setTheme]
  );

  const toggleTheme = useCallback(() => {
    setTheme(DARK_THEME);
  }, [setTheme]);

  const syncFromServer = useCallback(
    (_serverLight) => {
      setTheme(DARK_THEME, { persist: false });
    },
    [setTheme]
  );

  const value = useMemo(
    () => ({
      theme: DARK_THEME,
      light: false,
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
