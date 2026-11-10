export type ThemeChoice = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "spare-theme";

export function parseTheme(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" || value === "auto" ? value : "auto";
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "auto") return systemPrefersDark ? "dark" : "light";
  return choice;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Saved explicit choice ("light" | "dark"), or null. Never throws (private mode, blocked storage). */
export function readStoredTheme(storage: StorageLike | undefined): ResolvedTheme | null {
  try {
    const v = storage?.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function initialTheme(storage: StorageLike | undefined, systemPrefersDark: boolean): ResolvedTheme {
  return readStoredTheme(storage) ?? resolveTheme("auto", systemPrefersDark);
}

export function toggleTheme(current: ResolvedTheme): ResolvedTheme {
  return current === "dark" ? "light" : "dark";
}

export function saveTheme(storage: StorageLike | undefined, theme: ResolvedTheme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}
