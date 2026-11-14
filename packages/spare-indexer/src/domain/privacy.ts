const G_ADDRESS = /G[A-Z2-7]{55}/g;

export type PrivacyResult = { ok: true } | { ok: false; leaked: string[] };

/** Fails when output contains any G-address that is not explicitly allowed (foundations, USDC issuer). */
export function assertNoDonorAddresses(output: string, allowed: ReadonlySet<string>): PrivacyResult {
  const leaked = [...new Set(output.match(G_ADDRESS) ?? [])].filter((a) => !allowed.has(a)).sort();
  return leaked.length === 0 ? { ok: true } : { ok: false, leaked };
}
