import { readFileSync } from "node:fs";

/** Loads a recorded raw JSON fixture (public chain data, see recorded/README.md). */
export const rec = (name: string): unknown => JSON.parse(readFileSync(new URL(`./recorded/${name}`, import.meta.url), "utf8"));

/** Demo foundation on mainnet and the anchor payment used for opIndex parity (D6). */
export const FOUNDATION_MAINNET = "GBTDED5SE2QAKFQ3Y6NY75QGCKQTQ3Z6H3ZYM4PWUX3X36QMOKEEJFPQ";
export const ANCHOR_TX = "557f7fd054207f9ab4100a0186685cce7c46e4a7038b073478e528ad7c7296f1";
export const ANCHOR_LEDGER = 65477361;
/** Payer of the anchor payment: must never reach any adapter output. */
export const PAYER = "GCLIUGHWZK75INDCRXQJDMYWZ2VKMLJPUHQHUU2A7FNBKSZJGQF5DGPN";
