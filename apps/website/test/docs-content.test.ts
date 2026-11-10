import { describe, expect, it } from "vitest";
import { getDocs, getFaq, getHomeFaq } from "../src/i18n/docs";
import { HOME_FAQ_IDS, type Block } from "../src/i18n/docs/types";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { DOC_SLUGS, isDocSlug } from "../src/lib/docs-nav";
import { parseInline } from "../src/lib/inline";
import type { Lang } from "../src/i18n/utils";

const LANGS: Lang[] = ["en", "es"];
const msgs = { en, es };

function idsOf(lang: Lang, slug: (typeof DOC_SLUGS)[number]): Set<string> {
  const ids = new Set<string>([slug]);
  for (const b of getDocs(lang)[slug].blocks) {
    if (b.t === "h2") ids.add(b.id);
    if (b.t === "callout" && b.id) ids.add(b.id);
    if (b.t === "faq") for (const f of getFaq(lang)) ids.add(f.id);
  }
  return ids;
}

/** Resolve a locale-relative href ("docs/registry#register", "#how-it-works") to a known page + anchor. */
function resolves(lang: Lang, href: string): boolean {
  if (/^https?:/.test(href)) return true;
  const [path = "", hash = ""] = href.split("#");
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (clean === "") return hash === "" || hash === "how-it-works" || hash === "faq";
  if (["foundations", "dashboard", "demo"].includes(clean)) return hash === "";
  if (clean === "docs") return hash === "" || idsOf(lang, "introduction").has(hash);
  const m = /^docs\/(.+)$/.exec(clean);
  const slug = m?.[1];
  if (!isDocSlug(slug) || slug === "introduction") return false;
  return hash === "" || idsOf(lang, slug).has(hash);
}

describe("docs content", () => {
  it("every doc slug has content in both languages with a title and lead", () => {
    for (const lang of LANGS)
      for (const slug of DOC_SLUGS) {
        const p = getDocs(lang)[slug];
        expect(p.title.trim()).not.toBe("");
        expect(p.lead.trim()).not.toBe("");
        expect(p.blocks.length).toBeGreaterThan(0);
      }
  });

  it("EN and ES pages have the same structure (block kinds, h2 ids, table shapes, identical code)", () => {
    const shape = (b: Block) =>
      b.t === "h2" ? `h2:${b.id}` : b.t === "table" ? `table:${b.head.length}x${b.rows.length}` : b.t === "list" ? `list:${b.items.length}` : b.t === "code" ? `code:${b.code.split("\n").length}` : b.t;
    for (const slug of DOC_SLUGS)
      expect(getDocs("es")[slug].blocks.map(shape)).toEqual(getDocs("en")[slug].blocks.map(shape));
  });

  it("FAQ has the same ids in both languages and Home shows an existing subset", () => {
    expect(getFaq("es").map((f) => f.id)).toEqual(getFaq("en").map((f) => f.id));
    for (const lang of LANGS) {
      expect(getHomeFaq(lang).map((f) => f.id)).toEqual([...HOME_FAQ_IDS]);
    }
  });

  it("every internal link resolves to an existing page and anchor (nav, footer, doc: links)", () => {
    for (const lang of LANGS) {
      const m = msgs[lang];
      const hrefs: string[] = [];
      m.nav.links.forEach((l) => hrefs.push(l.href));
      m.footer.columns.forEach((c) => c.links.forEach((l) => l.href && hrefs.push(l.href)));
      for (const slug of DOC_SLUGS)
        for (const b of getDocs(lang)[slug].blocks) {
          const texts = b.t === "p" ? [b.text] : b.t === "list" ? b.items : b.t === "table" ? b.rows.flat() : b.t === "callout" ? [b.body] : [];
          for (const t of texts)
            for (const s of parseInline(t))
              if (s.t === "link" && s.href.startsWith("doc:")) {
                const target = s.href.slice(4);
                expect(isDocSlug(target), `${lang}/${slug}: ${s.href}`).toBe(true);
              }
        }
      for (const h of hrefs) expect(resolves(lang, h), `${lang}: ${h}`).toBe(true);
    }
  });

  it("the footer has no Project column and no Stellar Chile", () => {
    for (const lang of LANGS) {
      const titles = msgs[lang].footer.columns.map((c) => c.title);
      expect(titles).toHaveLength(3);
      expect(JSON.stringify(msgs[lang])).not.toMatch(/Stellar Chile|Instawards/);
    }
  });
});
