import { describe, expect, it } from "vitest";
import { DOC_SLUGS, docHref, docPath, pagerFor } from "../src/lib/docs-nav";
import { parseInline } from "../src/lib/inline";

describe("docs navigation", () => {
  it("introduction is /docs/, the rest /docs/<slug>/", () => {
    expect(docHref("en", "introduction")).toBe("/en/docs/");
    expect(docHref("es", "spare-sdk")).toBe("/es/docs/spare-sdk/");
    expect(docHref("en", "registry", "register")).toBe("/en/docs/registry/#register");
    expect(docPath("quick-start")).toBe("docs/quick-start");
  });
  it("pager order equals sidebar order, with no prev before the first and no next after the last", () => {
    expect(pagerFor(DOC_SLUGS[0]).prev).toBeNull();
    expect(pagerFor(DOC_SLUGS[DOC_SLUGS.length - 1]!).next).toBeNull();
    DOC_SLUGS.forEach((slug, i) => {
      expect(pagerFor(slug).prev).toBe(DOC_SLUGS[i - 1] ?? null);
      expect(pagerFor(slug).next).toBe(DOC_SLUGS[i + 1] ?? null);
    });
  });
  it("walking next from the first page visits every page once", () => {
    const seen: string[] = [];
    let cur: (typeof DOC_SLUGS)[number] | null = DOC_SLUGS[0];
    while (cur) {
      seen.push(cur);
      cur = pagerFor(cur).next;
    }
    expect(seen).toEqual([...DOC_SLUGS]);
  });
});

describe("parseInline", () => {
  it("splits text, code and links", () => {
    expect(parseInline("Use `addDonation` per [SEP-1](https://example.org/x) now")).toEqual([
      { t: "text", text: "Use " },
      { t: "code", text: "addDonation" },
      { t: "text", text: " per " },
      { t: "link", text: "SEP-1", href: "https://example.org/x" },
      { t: "text", text: " now" },
    ]);
  });
  it("leaves plain text alone and ignores non-http links", () => {
    expect(parseInline("plain")).toEqual([{ t: "text", text: "plain" }]);
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", text: "[x](javascript:alert(1))" }]);
  });
});
