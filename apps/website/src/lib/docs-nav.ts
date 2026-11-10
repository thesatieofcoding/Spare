import { localizePath, type Lang } from "../i18n/utils";

/** Sidebar order = pager order. */
export const DOC_SLUGS = [
  "introduction",
  "quick-start",
  "spare-sdk",
  "spare-wallets-kit",
  "registry",
  "indexer-dashboard",
  "stellar-toml",
  "faq",
] as const;
export type DocSlug = (typeof DOC_SLUGS)[number];

export function isDocSlug(value: unknown): value is DocSlug {
  return typeof value === "string" && (DOC_SLUGS as readonly string[]).includes(value);
}

/** Locale-relative path of a docs page: Introduction lives at `docs`, the rest at `docs/<slug>`. */
export function docPath(slug: DocSlug, hash = ""): string {
  const base = slug === "introduction" ? "docs" : `docs/${slug}`;
  return hash ? `${base}#${hash.replace(/^#/, "")}` : base;
}

export function docHref(lang: Lang, slug: DocSlug, hash = ""): string {
  return localizePath(lang, docPath(slug, hash));
}

export const QUICK_START_PATH = docPath("quick-start");

export function pagerFor(slug: DocSlug): { prev: DocSlug | null; next: DocSlug | null } {
  const i = DOC_SLUGS.indexOf(slug);
  return { prev: i > 0 ? (DOC_SLUGS[i - 1] ?? null) : null, next: i < DOC_SLUGS.length - 1 ? (DOC_SLUGS[i + 1] ?? null) : null };
}
