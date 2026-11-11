// User preferences (theme, defaults), saved in this browser's localStorage.
import { useSyncExternalStore } from "react";
import type { AspectRatio, DownloadFormat } from "./api";
import { SETTINGS_KEY } from "./theme-script";

export type Theme = "system" | "light" | "dark";

export interface Settings {
  theme: Theme;
  format: DownloadFormat; // default download format
  aspect: AspectRatio; // default aspect ratio for new images
  enhance: boolean; // prompt enhancer on by default
  sidebarCollapsed: boolean;
}

const DEFAULTS: Settings = { theme: "system", format: "png", aspect: "1:1", enhance: false, sidebarCollapsed: false };

let cache: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    cache = DEFAULTS;
  }
  return cache!;
}

export function updateSettings(patch: Partial<Settings>) {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cache));
  } catch {
    /* private mode: keep the setting for this visit only */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSettings,
    () => DEFAULTS,
  );
}

/** Put the "dark" class on <html> when the chosen (or system) theme is dark. */
export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
