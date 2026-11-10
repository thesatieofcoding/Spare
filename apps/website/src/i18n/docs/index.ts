import { enDocs, enFaq } from "./en";
import { esDocs, esFaq } from "./es";
import type { DocsContent, FaqItem } from "./types";
import { HOME_FAQ_IDS } from "./types";
import type { Lang } from "../utils";

export function getDocs(lang: Lang): DocsContent {
  return lang === "es" ? esDocs : enDocs;
}

export function getFaq(lang: Lang): FaqItem[] {
  return lang === "es" ? esFaq : enFaq;
}

export function getHomeFaq(lang: Lang): FaqItem[] {
  const all = getFaq(lang);
  return HOME_FAQ_IDS.map((id) => all.find((f) => f.id === id)).filter((f): f is FaqItem => Boolean(f));
}
