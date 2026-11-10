import { describe, expect, it } from "vitest";
import { getLangFromPath, isLang, localizePath, switchLangPath } from "../src/i18n/utils";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

describe("isLang", () => {
  it("accepts supported locales only", () => {
    expect(isLang("en")).toBe(true);
    expect(isLang("es")).toBe(true);
    expect(isLang("fr")).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });
});

describe("getLangFromPath", () => {
  it("reads the first segment", () => {
    expect(getLangFromPath("/es/docs/")).toBe("es");
    expect(getLangFromPath("/en/")).toBe("en");
  });
  it("falls back to the default locale", () => {
    expect(getLangFromPath("/")).toBe("en");
    expect(getLangFromPath("/fr/x/")).toBe("en");
  });
});

describe("localizePath", () => {
  it("prefixes the locale and keeps a trailing slash", () => {
    expect(localizePath("es", "docs")).toBe("/es/docs/");
    expect(localizePath("en", "/docs/")).toBe("/en/docs/");
    expect(localizePath("en", "")).toBe("/en/");
  });
  it("keeps hash fragments", () => {
    expect(localizePath("es", "#how-it-works")).toBe("/es/#how-it-works");
    expect(localizePath("en", "docs#quick-start")).toBe("/en/docs/#quick-start");
  });
});

describe("switchLangPath", () => {
  it("keeps the same page when changing language", () => {
    expect(switchLangPath("/en/docs/", "es")).toBe("/es/docs/");
    expect(switchLangPath("/es/", "en")).toBe("/en/");
    expect(switchLangPath("/en/foundations", "es")).toBe("/es/foundations/");
  });
  it("handles paths with no locale", () => {
    expect(switchLangPath("/", "es")).toBe("/es/");
  });
});

describe("messages", () => {
  const flat = (o: unknown, p = ""): Record<string, string> =>
    Object.entries(o as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
      if (typeof v === "string") acc[p + k] = v;
      else if (Array.isArray(v))
        v.forEach((x, i) => {
          if (typeof x === "string") acc[`${p}${k}.${i}`] = x;
          else Object.assign(acc, flat(x, `${p}${k}.${i}.`));
        });
      else Object.assign(acc, flat(v, `${p}${k}.`));
      return acc;
    }, {});
  it("en and es expose the same keys, none empty", () => {
    const a = flat(en);
    const b = flat(es);
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
    for (const v of [...Object.values(a), ...Object.values(b)]) expect(v.trim()).not.toBe("");
  });
  it("es uses tu (informal)", () => {
    expect(JSON.stringify(es)).not.toMatch(/\busted(es)?\b/i);
  });
});
