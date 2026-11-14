import type { DonationPrompt, Locale } from "./types.js";

/** "0.5000000" -> "0.50" (en) / "0,50" (es); keeps extra decimals only when they matter. */
export function formatUsd(usdc: string, locale: Locale = "en"): string {
  const [i = "0", f = ""] = usdc.split(".");
  const frac = f.replace(/0+$/, "").padEnd(2, "0");
  return `${i}${locale === "es" ? "," : "."}${frac}`;
}

/**
 * XLM ceiling for display: rounded UP to 2 decimals so it never understates what may be spent.
 * "2.0400001" -> "2.05"; locale picks the decimal mark.
 */
export function formatXlmMax(xlm: string, locale: Locale = "en"): string {
  const [i = "0", f = ""] = xlm.split(".");
  const stroops = BigInt(i) * 10_000_000n + BigInt(f.padEnd(7, "0").slice(0, 7));
  const cents = (stroops + 99_999n) / 100_000n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${cents / 100n}${locale === "es" ? "," : "."}${frac}`;
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
  ledgerXlm: (usd: string) => string;
  amountLegend: string;
  other: string;
  otherLabel: string;
  payLegend: string;
  xlmMax: (xlm: string) => string;
  xlmPay: (xlm: string, usd: string, name: string) => string;
  checking: string;
  unavailable: string;
  invalidAmount: (min: string, max: string) => string;
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
    ledgerXlm: (a) => `Check your Ledger: it will show a path payment of ${a} USDC, paid in XLM, before you approve.`,
    amountLegend: "Amount",
    other: "Other",
    otherLabel: "Other amount (US$)",
    payLegend: "Pay with",
    xlmMax: (x) => `≈ ${x} XLM max`,
    xlmPay: (x, a, n) => `You pay at most ${x} XLM; ${n} receives US$${a} in USDC. Unused XLM stays with you.`,
    checking: "Checking…",
    unavailable: "This option isn't available right now.",
    invalidAmount: (min, max) => `Enter an amount from US$${min} to US$${max}.`,
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
    ledgerXlm: (a) => `Revisa tu Ledger: mostrará un pago con ruta (path payment) de ${a} USDC, pagado en XLM, antes de que apruebes.`,
    amountLegend: "Monto",
    other: "Otro",
    otherLabel: "Otro monto (US$)",
    payLegend: "Pagar con",
    xlmMax: (x) => `≈ ${x} XLM máx.`,
    xlmPay: (x, a, n) => `Pagas como máximo ${x} XLM; ${n} recibe US$${a} en USDC. El XLM que no se use queda contigo.`,
    checking: "Verificando…",
    unavailable: "Esta opción no está disponible ahora.",
    invalidAmount: (min, max) => `Ingresa un monto entre US$${min} y US$${max}.`,
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
  /** XLM only: the most XLM the donor may spend, and that the foundation receives USDC. */
  payNote: string | null;
}

/** Labels for the interactive controls. */
export function choiceText(locale: Locale) {
  const c = COPY[locale];
  return {
    amountLegend: c.amountLegend,
    other: c.other,
    otherLabel: c.otherLabel,
    roundUp: (total: string) => c.roundUp(formatUsd(total, locale)),
    payLegend: c.payLegend,
    xlmMax: (xlm: string) => c.xlmMax(formatXlmMax(xlm, locale)),
    checking: c.checking,
    unavailable: c.unavailable,
    invalidAmount: (min: string, max: string) => c.invalidAmount(formatUsd(min, locale), formatUsd(max, locale)),
    usd: (v: string) => `US$${formatUsd(v, locale)}`,
  };
}

export function modalText(p: DonationPrompt, locale: Locale): ModalText {
  const c = COPY[locale];
  const f = (v: string) => formatUsd(v, locale);
  const amount = f(p.amount);
  const roundUp = p.mode === "round-up" && p.roundUpTotal !== undefined && p.purchaseTotal !== undefined;
  let note: string | null = null;
  const xlm = p.payWith === "xlm" && p.xlmSendMax !== undefined;
  const ledger = xlm ? c.ledgerXlm(amount) : c.ledger(amount);
  if (p.wallet === "ledger") note = p.secondSignature ? `${ledger} ${c.ledgerTwice}` : ledger;
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
    payNote: xlm ? c.xlmPay(formatXlmMax(p.xlmSendMax as string, locale), amount, p.foundationName) : null,
  };
}
