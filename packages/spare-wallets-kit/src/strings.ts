import type { DonationPrompt, Locale } from "./types.js";

/** "0.5000000" -> "0.50" (en) / "0,50" (es); keeps extra decimals only when they matter. */
export function formatUsd(usdc: string, locale: Locale = "en"): string {
  const [i = "0", f = ""] = usdc.split(".");
  const frac = f.replace(/0+$/, "").padEnd(2, "0");
  return `${i}${locale === "es" ? "," : "."}${frac}`;
}

interface Copy {
  fixedTitle: (usd: string, name: string) => string;
  roundTitle: (name: string) => string;
  body: string;
  roundBody: (purchase: string, total: string, extra: string, name: string) => string;
  legal: string;
  verified: (domain: string) => string;
  add: (usd: string) => string;
  roundUp: (usd: string) => string;
  skip: string;
  soroban: string;
  ledger: (usd: string) => string;
  ledgerTwice: string;
}

const COPY: Record<Locale, Copy> = {
  en: {
    fixedTitle: (a, n) => `Add US$${a} for ${n}?`,
    roundTitle: (n) => `Round up for ${n}?`,
    body: "Your payment stays the same until you confirm. You can skip this.",
    roundBody: (p, t, x, n) => `Your US$${p} payment becomes US$${t}. The extra US$${x} goes to ${n}.`,
    legal: "You decide. Spare never holds the funds.",
    verified: (d) => `Domain-verified: ${d}`,
    add: (a) => `Add US$${a}`,
    roundUp: (t) => `Round up to US$${t}`,
    skip: "Not now",
    soroban: "This is a separate payment, so your wallet will ask for a second signature.",
    ledger: (a) => `Check your Ledger: it will show “Payment ${a} USDC” before you approve.`,
    ledgerTwice: "It is a separate payment, so a second signature is needed.",
  },
  es: {
    fixedTitle: (a, n) => `¿Sumar US$${a} para ${n}?`,
    roundTitle: (n) => `¿Redondear para ${n}?`,
    body: "Tu pago sigue igual hasta que confirmes. Puedes seguir sin aportar.",
    roundBody: (p, t, x, n) => `Tu pago de US$${p} pasa a US$${t}. Los US$${x} extra van a ${n}.`,
    legal: "Tú decides. Spare nunca retiene los fondos.",
    verified: (d) => `Dominio verificado: ${d}`,
    add: (a) => `Sumar US$${a}`,
    roundUp: (t) => `Redondear a US$${t}`,
    skip: "Ahora no",
    soroban: "Es un pago aparte, así que tu billetera te pedirá una segunda firma.",
    ledger: (a) => `Revisa tu Ledger: mostrará “Pago ${a} USDC” antes de que apruebes.`,
    ledgerTwice: "Es un pago aparte, así que hace falta una segunda firma.",
  },
};

export interface ModalText {
  title: string;
  body: string;
  walletNote: string | null;
  primary: string;
  secondary: string;
  legal: string;
  /** "Domain-verified: <domain>": the foundation's stellar.toml lists its account, nothing more. */
  domain: string;
}

export function modalText(p: DonationPrompt, locale: Locale): ModalText {
  const c = COPY[locale];
  const f = (v: string) => formatUsd(v, locale);
  const amount = f(p.amount);
  const roundUp = p.mode === "round-up" && p.roundUpTotal !== undefined && p.purchaseTotal !== undefined;
  let note: string | null = null;
  if (p.wallet === "ledger") note = p.secondSignature ? `${c.ledger(amount)} ${c.ledgerTwice}` : c.ledger(amount);
  else if (p.wallet === "soroban" || p.secondSignature) note = c.soroban;
  return {
    title: roundUp ? c.roundTitle(p.foundationName) : c.fixedTitle(amount, p.foundationName),
    body: roundUp
      ? c.roundBody(f(p.purchaseTotal as string), f(p.roundUpTotal as string), amount, p.foundationName)
      : c.body,
    walletNote: note,
    primary: roundUp ? c.roundUp(f(p.roundUpTotal as string)) : c.add(amount),
    secondary: c.skip,
    legal: c.legal,
    domain: c.verified(p.foundationDomain),
  };
}
