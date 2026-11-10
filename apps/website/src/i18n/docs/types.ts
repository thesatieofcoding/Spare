import type { DocSlug } from "../../lib/docs-nav";

export type Block =
  | { t: "p"; text: string }
  | { t: "h2"; id: string; text: string; toc?: string }
  | { t: "h3"; text: string }
  | { t: "code"; code: string; label?: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "list"; items: string[] }
  | { t: "callout"; id?: string; title: string; body: string }
  | { t: "planned"; title: string; body: string }
  /** Renders every FaqItem of the language (single source shared with the Home FAQ). */
  | { t: "faq" };

export interface DocPage {
  title: string;
  metaTitle: string;
  lead: string;
  blocks: Block[];
}

export type DocsContent = Record<DocSlug, DocPage>;

export interface FaqItem {
  id: string;
  q: string;
  a: string;
}

/** Ids of the FAQ entries shown on Home, in order. */
export const HOME_FAQ_IDS = ["custody", "fees", "round-up", "soroban", "privacy", "verification"] as const;
