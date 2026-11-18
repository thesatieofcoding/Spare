const SCALE = 7;

/** Exact sum of 7dp USDC strings (bigint, no float). */
export function sumUsdc(amounts: string[]): string {
  const total = amounts.reduce((acc, a) => {
    const [i = "0", f = ""] = a.split(".");
    return acc + BigInt(i) * 10n ** BigInt(SCALE) + BigInt(f.padEnd(SCALE, "0").slice(0, SCALE));
  }, 0n);
  const s = total.toString().padStart(SCALE + 1, "0");
  return `${s.slice(0, -SCALE)}.${s.slice(-SCALE)}`;
}

/** ISO instant to "YYYY-MM-DD HH:MM UTC" (locale-independent, so builds are reproducible). */
export function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
