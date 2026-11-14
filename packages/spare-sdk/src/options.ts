/**
 * Runtime shape check for the options every entry point needs. The types say these exist, but
 * plain-JS callers can omit them; a TypeError must never escape, so callers map false to
 * `not-offered` / `invalid-options`.
 */
export function hasRequiredOptions(opts: unknown): boolean {
  if (typeof opts !== "object" || opts === null) return false;
  const { foundation, accounts } = opts as { foundation?: unknown; accounts?: unknown };
  if (typeof foundation !== "object" || foundation === null) return false;
  const f = foundation as { account?: unknown; domain?: unknown };
  if (typeof f.account !== "string" || typeof f.domain !== "string") return false;
  return (
    typeof accounts === "object" && accounts !== null &&
    typeof (accounts as { loadAccount?: unknown }).loadAccount === "function"
  );
}
