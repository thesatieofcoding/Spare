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

/** Build a locale-prefixed path with a trailing slash. Hash fragments are preserved. */
export function localizePath(lang: Lang, path: string): string {
  const hashIndex = path.indexOf("#");
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const clean = (hashIndex >= 0 ? path.slice(0, hashIndex) : path).replace(/^\/+|\/+$/g, "");
  return `/${lang}/${clean ? `${clean}/` : ""}${hash}`;
}

/** Same page, other language. */
export function switchLangPath(pathname: string, target: Lang): string {
  const parts = pathname.split("/").filter(Boolean);
  if (isLang(parts[0])) parts.shift();
  return localizePath(target, parts.join("/"));
}
