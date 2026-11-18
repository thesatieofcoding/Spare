import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const G_ADDRESS = /G[A-Z2-7]{55}/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>|\bstyle="([^"]*)"/g;

export const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? listFiles(join(dir, f)) : [join(dir, f)]));

const text = (file: string) => readFileSync(file, "utf8");

/** Every Stellar-address-shaped string in dist that is not in `allowed`. */
export function findAddresses(
  dir: string,
  allowed: ReadonlySet<string>,
  include: (file: string) => boolean = () => true,
): { file: string; address: string }[] {
  return listFiles(dir).filter(include).flatMap((file) =>
    [...new Set(text(file).match(G_ADDRESS) ?? [])].filter((a) => !allowed.has(a)).map((address) => ({ file, address })),
  );
}

/** Raw hex colors inside HTML <style> blocks and style="" attributes (anchors like href="#abc" are ignored). `allowed` = hex values defined by the design tokens. */
export function findInlineHex(
  dir: string,
  allowed: ReadonlySet<string> = new Set(),
  include: (file: string) => boolean = () => true,
): { file: string; color: string }[] {
  return listFiles(dir)
    .filter((f) => f.endsWith(".html") && include(f))
    .flatMap((file) =>
      [...text(file).matchAll(STYLE_BLOCK)].flatMap((m) =>
        (m[1] ?? m[2] ?? "").match(HEX)?.filter((c) => !allowed.has(c.toLowerCase())).map((color) => ({ file, color })) ?? [],
      ),
    );
}
