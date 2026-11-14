export interface NavLink {
  label: string;
  href: string;
}

export interface FooterLink {
  label: string;
  /** Path relative to the locale root, an absolute URL, or undefined (plain text until the destination exists). */
  href?: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface FeatureItem {
  icon: "open-source" | "transparent" | "no-custody" | "flexible";
  title: string;
  body: string;
}

export interface CardItem {
  title: string;
  body: string;
}

export interface StepItem {
  title: string;
  body: string;
}

export const DEMO_REASONS = [
  "network-mismatch", "amount-over-cap", "round-up-needs-usdc-purchase", "round-up-already-whole",
  "foundation-not-verified", "foundation-trustline-missing", "foundation-trustline-unauthorized",
  "foundation-trustline-full", "user-trustline-missing", "user-trustline-unauthorized", "insufficient-balance",
  "account-lookup-failed", "main-tx-not-successful", "unsupported-operation", "multisig", "multiple-sources",
  "extra-signers", "fee-bump", "already-signed", "soroban", "other",
] as const;
export type DemoReasonKey = (typeof DEMO_REASONS)[number];

export const DEMO_STATUSES = [
  "idle", "connecting", "ready", "building", "simulating", "signing", "submitting", "polling",
  "offering-follow-up", "submitting-follow-up", "done", "error",
] as const;
export const DEMO_ERRORS = [
  "not-configured", "rpc-unavailable", "no-wallet", "connect-rejected", "signature-rejected",
  "submit-failed", "simulation-failed", "poll-timeout", "main-tx-failed", "unexpected",
] as const;
export const DEMO_OUTCOMES = [
  "donated", "declined", "not-offered", "passthrough", "follow-up-skipped", "follow-up-failed",
] as const;

export interface DemoCopy {
  eyebrow: string;
  title: string;
  lead: string;
  badge: string;
  networkLabel: string;
  testnet: string;
  mainnet: string;
  /** Shown when the selected network lacks a foundation or merchant account. */
  notConfigured: string;
  rpcUnavailable: string;
  connect: string;
  disconnect: string;
  /** Contains {address}. */
  connectedAs: string;
  /** Contains {amount}. */
  purchase: string;
  ledgerHint: string;
  classic: { title: string; body: string; button: string };
  soroban: { title: string; body: string; notice: string; button: string };
  privacy: string;
  explorer: string;
  /** Visually hidden hint appended to links that open in a new tab. */
  newTab: string;
  mainTx: string;
  donationTx: string;
  retry: string;
  again: string;
  details: string;
  /** Contains {amount}. */
  donatedAmount: string;
  status: Record<(typeof DEMO_STATUSES)[number], string>;
  errors: Record<(typeof DEMO_ERRORS)[number], string>;
  outcomes: Record<(typeof DEMO_OUTCOMES)[number], string>;
  reasons: Record<DemoReasonKey, string>;
}

export interface Messages {
  meta: { title: string; description: string };
  a11y: { skipToContent: string; menuOpen: string; menuClose: string; mainNav: string; langSwitcher: string; home: string };
  nav: { getStarted: string; darkMode: string; links: NavLink[] };
  hero: {
    eyebrow: string;
    headlineLead: string;
    headlineAccent: string;
    subhead: string;
    primaryCta: string;
    secondaryCta: string;
    trust: string;
    illustrationAlt: string;
  };
  idea: { eyebrow: string; headline: string; illustrationAlt: string };
  features: { eyebrow: string; headline: string; items: FeatureItem[] };
  cards: { integrate: CardItem; give: CardItem; receive: CardItem };
  how: { title: string; docsLink: string; steps: StepItem[] };
  footer: {
    ctaTitle: string;
    ctaButton: string;
    tagline: string;
    columns: FooterColumn[];
    legal: string;
    socialX: string;
    socialGithub: string;
    characterAlt: string;
  };
  docs: {
    sidebarLabel: string;
    tocTitle: string;
    codeLabel: string;
    copy: string;
    copied: string;
    pagerLabel: string;
    eyebrow: string;
  };
  faq: { eyebrow: string; title: string; seeAll: string };
  comingSoon: { title: string; body: string; back: string };
  demo: DemoCopy;
  pages: { docs: string; foundations: string; dashboard: string; demo: string };
}
