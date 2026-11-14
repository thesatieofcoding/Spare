/** Circle's USDC issuer on Stellar. Spare accepts no other USDC. */
export const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const USDC_CODE = "USDC";

export const STROOPS_PER_UNIT = 10_000_000n;
/** Stellar's max int64 amount, in stroops. */
export const MAX_STROOPS = 9_223_372_036_854_775_807n;

export const MEMO_PREFIX = "spare:";
export const MAX_APP_ID_BYTES = 22; // 28-byte text memo minus "spare:"
export const DEFAULT_BASE_FEE = "100";
export const MIN_BASE_FEE = 100n;
/** SEP-1: stellar.toml must not exceed 100KB. */
export const MAX_TOML_BYTES = 100 * 1024;

/** Largest total fee a transaction can carry (uint32), in stroops. */
export const MAX_TX_FEE = 4_294_967_295n;
