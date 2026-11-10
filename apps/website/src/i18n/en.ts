import type { Messages } from "./types";

export const en: Messages = {
  meta: {
    title: "Spare — a small gift at checkout",
    description:
      "Open-source kit that lets any Stellar app offer a small USDC donation at signing time. The person always decides. Spare never takes custody of the funds.",
  },
  a11y: {
    skipToContent: "Skip to content",
    menuOpen: "Open menu",
    menuClose: "Close menu",
    mainNav: "Main",
    langSwitcher: "Language",
    home: "Spare, home",
  },
  nav: {
    getStarted: "Get started",
    darkMode: "Dark mode",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Foundations", href: "foundations" },
      { label: "Documentation", href: "docs" },
      { label: "Resources", href: "demo" },
      { label: "Dashboard", href: "dashboard" },
    ],
  },
  hero: {
    eyebrow: "Open source, on Stellar",
    headlineLead: "Add a little, ",
    headlineAccent: "or skip.",
    subhead:
      "Before they sign, an app can ask if they want to add a little for a foundation, or round up. They decide. Spare never takes custody of the funds.",
    primaryCta: "How it works",
    secondaryCta: "Read the quick start",
    trust: "Open source · MIT  ·  No custody  ·  The registry is public",
    illustrationAlt: "Three people sharing a picnic on a checkered blanket, seen from above.",
  },
  idea: {
    eyebrow: "The idea",
    headline: "A short question at checkout, in wallets they already use.",
    illustrationAlt: "Two people sitting on the grass, one handing something to the other.",
  },
  features: {
    eyebrow: "What this is",
    headline: "Simple, transparent donations in the payment flow.",
    items: [
      { icon: "open-source", title: "Open source", body: "The kit, the interface, the registry, and the indexer are public." },
      { icon: "transparent", title: "Transparent", body: "Every foundation has a record anyone can read." },
      { icon: "no-custody", title: "No custody", body: "The gift goes to the foundation. Spare never holds the funds." },
      { icon: "flexible", title: "Flexible", body: "A fixed amount or a round-up, in classic wallets, Soroban, or Ledger." },
    ],
  },
  cards: {
    integrate: { title: "Add it to your app", body: "Add the question to checkout with the SDK and Spare Wallets Kit." },
    give: { title: "Give, if they want", body: "A fixed amount or a round-up. They can always continue without giving." },
    receive: { title: "Foundations receive", body: "The gift goes straight to the foundation. The movement stays in view." },
  },
  how: {
    title: "How it works",
    docsLink: "View documentation",
    steps: [
      { title: "The app asks", body: "When they sign, they see the option to add a little or round up." },
      { title: "They decide", body: "They accept, change the amount, or continue. Nothing moves without their signature." },
      { title: "The registry is public", body: "The foundation receives the gift. The movement is recorded in the registry." },
    ],
  },
  footer: {
    ctaTitle: "Add the question to checkout.",
    ctaButton: "Read the quick start",
    tagline: "An open-source kit for a small gift at checkout. The person always decides.",
    columns: [
      {
        title: "Product",
        links: [
          { label: "SDK", href: "docs/spare-sdk" },
          { label: "Wallets Kit", href: "docs/spare-wallets-kit" },
          { label: "Registry", href: "docs/registry" },
          { label: "Dashboard", href: "dashboard" },
        ],
      },
      {
        title: "Developers",
        links: [
          { label: "Docs", href: "docs" },
          { label: "Quickstart", href: "docs/quick-start" },
          { label: "GitHub", href: "https://github.com/thesatieofcoding/Spare" },
          { label: "npm", href: "https://www.npmjs.com/package/spare-sdk" },
        ],
      },
      {
        title: "Foundations",
        links: [
          { label: "Register", href: "docs/registry#register" },
          { label: "Verification", href: "docs/stellar-toml" },
          { label: "Directory", href: "foundations" },
        ],
      },
    ],
    legal: "© 2026 Spare  ·  MIT License",
    socialX: "Spare on X",
    socialGithub: "Spare on GitHub",
    characterAlt: "A person carrying a box, seen from above.",
  },
  docs: {
    sidebarLabel: "Documentation",
    tocTitle: "On this page",
    codeLabel: "Code example",
    copy: "Copy",
    copied: "Copied",
    pagerLabel: "Documentation pages",
    eyebrow: "Documentation",
  },
  faq: { eyebrow: "FAQ", title: "Questions, answered", seeAll: "See all questions" },
  comingSoon: { title: "Coming soon", body: "This page is on its way.", back: "Back to home" },
  pages: { docs: "Documentation", foundations: "Foundations", dashboard: "Dashboard", demo: "Demo" },
};
