import { en } from "./en";
import { es } from "./es";
import type { Messages } from "./types";

export const LANGS = ["en", "es"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

export function getMessages(lang: Lang): Messages {
  return lang === "es" ? es : en;
}

export function getLangFromPath(pathname: string): Lang {
  const first = pathname.split("/").filter(Boolean)[0];
  return isLang(first) ? first : DEFAULT_LANG;
}

/** Build a locale path with a trailing slash. English is unprefixed; other locales get /<lang>/. Hash fragments are preserved. */
export function localizePath(lang: Lang, path: string): string {
  const hashIndex = path.indexOf("#");
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const clean = (hashIndex >= 0 ? path.slice(0, hashIndex) : path).replace(/^\/+|\/+$/g, "");
  const prefix = lang === DEFAULT_LANG ? "/" : `/${lang}/`;
  return `${prefix}${clean ? `${clean}/` : ""}${hash}`;
}

/** Same page, other language. */
export function switchLangPath(pathname: string, target: Lang): string {
  const parts = pathname.split("/").filter(Boolean);
  if (isLang(parts[0])) parts.shift();
  return localizePath(target, parts.join("/"));
}

/** hreflang alternates for a page: one per locale plus x-default (the unprefixed English root). */
export function alternateLinks(pathname: string): { hreflang: string; href: string }[] {
  return [
    ...LANGS.map((l) => ({ hreflang: l, href: switchLangPath(pathname, l) })),
    { hreflang: "x-default", href: localizePath(DEFAULT_LANG, "") },
  ];
}

/** Optional rest-param value for `[...lang]` routes: undefined (unprefixed) for the default locale. */
export function langParam(lang: Lang): string | undefined {
  return lang === DEFAULT_LANG ? undefined : lang;
}

/** Inverse of `langParam`. */
export function paramToLang(param: string | undefined): Lang {
  return isLang(param) ? param : DEFAULT_LANG;
}
