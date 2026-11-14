import type { DemoConfig } from "./config";

/** Pulls the G... entries of the `ACCOUNTS = [ ... ]` array out of a stellar.toml. */
export function tomlAccounts(toml: string): string[] {
  const block = /^\s*ACCOUNTS\s*=\s*\[([\s\S]*?)\]/m.exec(toml)?.[1] ?? "";
  return [...block.matchAll(/"(G[A-Z2-7]{55})"/g)].map((m) => m[1] as string);
}

/**
 * Build-time guard: every configured demo foundation must be listed in the site's stellar.toml,
 * otherwise the SDK would reject it at runtime and the demo would silently offer nothing.
 */
export function assertFoundationsInToml(config: DemoConfig, toml: string): void {
  const listed = new Set(tomlAccounts(toml));
  for (const network of ["testnet", "mainnet"] as const) {
    const f = config[network].foundation;
    if (f !== null && !listed.has(f.account)) {
      throw new Error(
        `Demo ${network} foundation ${f.account} is not in public/.well-known/stellar.toml ACCOUNTS. Add it before building.`,
      );
    }
  }
}
