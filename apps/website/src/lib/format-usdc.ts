/** Stroop-precision USDC ("1.5000000") to display ("1.50"); string math only, keeps decimals that matter. */
export function formatUsdc(usdc: string): string {
  const [i = "0", f = ""] = usdc.split(".");
  return `${i}.${f.replace(/0+$/, "").padEnd(2, "0")}`;
}
