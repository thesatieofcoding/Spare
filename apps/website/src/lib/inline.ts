export type InlineSegment =
  | { t: "text"; text: string }
  | { t: "code"; text: string }
  | { t: "link"; text: string; href: string };

/** Tiny inline syntax for doc copy: `code`, [label](https://url) and [label](doc:slug) for internal doc pages. Nothing else. */
export function parseInline(input: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  const re = /`([^`]+)`|\[([^\]]+)\]\(((?:https?:\/\/|doc:)[^)\s]+)\)/g;
  let last = 0;
  for (const m of input.matchAll(re)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ t: "text", text: input.slice(last, index) });
    if (m[1] !== undefined) out.push({ t: "code", text: m[1] });
    else out.push({ t: "link", text: m[2] ?? "", href: m[3] ?? "" });
    last = index + m[0].length;
  }
  if (last < input.length) out.push({ t: "text", text: input.slice(last) });
  return out;
}
