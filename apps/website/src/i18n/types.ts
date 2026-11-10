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
  pages: { docs: string; foundations: string; dashboard: string; demo: string };
}
