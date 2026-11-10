import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme, THEME_STORAGE_KEY } from "../src/lib/theme";

describe("parseTheme", () => {
  it("accepts light, dark, auto", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("auto")).toBe("auto");
  });
  it("falls back to auto for anything else", () => {
    expect(parseTheme(null)).toBe("auto");
    expect(parseTheme("sepia")).toBe("auto");
    expect(parseTheme(undefined)).toBe("auto");
  });
});

describe("resolveTheme", () => {
  it("explicit choice wins over the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("auto follows the system", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
  });
});

it("uses a stable storage key", () => {
  expect(THEME_STORAGE_KEY).toBe("spare-theme");
});

import { initialTheme, readStoredTheme, saveTheme, toggleTheme, type StorageLike } from "../src/lib/theme";

const memory = (seed: Record<string, string> = {}): StorageLike => {
  const m = { ...seed };
  return {
    getItem: (k) => m[k] ?? null,
    setItem: (k, v) => {
      m[k] = v;
    },
  };
};
const broken: StorageLike = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

describe("readStoredTheme", () => {
  it("returns a saved explicit choice", () => {
    expect(readStoredTheme(memory({ "spare-theme": "dark" }))).toBe("dark");
  });
  it("ignores junk, missing, and throwing storage", () => {
    expect(readStoredTheme(memory({ "spare-theme": "x" }))).toBeNull();
    expect(readStoredTheme(memory())).toBeNull();
    expect(readStoredTheme(broken)).toBeNull();
    expect(readStoredTheme(undefined)).toBeNull();
  });
});

describe("initialTheme", () => {
  it("prefers the saved choice over the system", () => {
    expect(initialTheme(memory({ "spare-theme": "light" }), true)).toBe("light");
  });
  it("falls back to the system preference", () => {
    expect(initialTheme(memory(), true)).toBe("dark");
    expect(initialTheme(memory(), false)).toBe("light");
    expect(initialTheme(broken, true)).toBe("dark");
  });
});

describe("toggleTheme + saveTheme", () => {
  it("flips between light and dark", () => {
    expect(toggleTheme("light")).toBe("dark");
    expect(toggleTheme("dark")).toBe("light");
  });
  it("persists and reads back", () => {
    const s = memory();
    saveTheme(s, "dark");
    expect(readStoredTheme(s)).toBe("dark");
  });
  it("never throws when storage is unavailable", () => {
    expect(() => saveTheme(broken, "dark")).not.toThrow();
    expect(() => saveTheme(undefined, "dark")).not.toThrow();
  });
});
