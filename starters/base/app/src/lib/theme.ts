import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "sfab-theme";

const listeners = new Set<() => void>();

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveDark(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark());
}

function applyTheme(theme: Theme): void {
  const dark = resolveDark(theme);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function getTheme(): Theme {
  return readStored();
}

function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore quota / private mode
  }
  applyTheme(theme);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readStored() === "system") {
      applyTheme("system");
      listener();
    }
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", onSystem);
  };
}

export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedDark: boolean;
} {
  const theme = useSyncExternalStore(
    subscribe,
    getTheme,
    (): Theme => "system"
  );
  return {
    theme,
    setTheme,
    resolvedDark: resolveDark(theme),
  };
}
