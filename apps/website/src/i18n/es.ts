import type { Messages } from "./types";

export const es: Messages = {
  meta: {
    title: "Spare — un aporte pequeño al pagar",
    description:
      "Kit de código abierto para que cualquier app de Stellar ofrezca una donación pequeña en USDC al firmar. La persona siempre decide. Spare nunca custodia los fondos.",
  },
  a11y: {
    skipToContent: "Saltar al contenido",
    menuOpen: "Abrir menú",
    menuClose: "Cerrar menú",
    mainNav: "Principal",
    langSwitcher: "Idioma",
    home: "Spare, inicio",
  },
  nav: {
    getStarted: "Empezar",
    darkMode: "Modo oscuro",
    links: [
      { label: "Cómo funciona", href: "#how-it-works" },
      { label: "Fundaciones", href: "foundations" },
      { label: "Documentación", href: "docs" },
      { label: "Recursos", href: "demo" },
      { label: "Tablero", href: "dashboard" },
    ],
  },
  hero: {
    eyebrow: "Código abierto, en Stellar",
    headlineLead: "Suma un poco, ",
    headlineAccent: "o sigue.",
    subhead:
      "Antes de firmar, una app puede preguntar si quieren sumar un poco para una fundación, o redondear. Ellos deciden. Spare nunca custodia los fondos.",
    primaryCta: "Cómo funciona",
    secondaryCta: "Leer la guía rápida",
    trust: "Código abierto · MIT  ·  Sin custodia  ·  El registro es público",
    illustrationAlt: "Tres personas compartiendo un picnic sobre un mantel a cuadros, vistas desde arriba.",
  },
  idea: {
    eyebrow: "La idea",
    headline: "Una pregunta breve al pagar, en wallets que ya usan.",
    illustrationAlt: "Dos personas sentadas en el pasto, una le entrega algo a la otra.",
  },
  features: {
    eyebrow: "De qué se trata",
    headline: "Donaciones simples, transparentes y en tus pagos.",
    items: [
      { icon: "open-source", title: "Código abierto", body: "El kit, la interfaz, el registro y el indexador son públicos." },
      { icon: "transparent", title: "Transparente", body: "Cada fundación tiene un registro que cualquiera puede leer." },
      { icon: "no-custody", title: "Sin custodia", body: "El aporte va a la fundación. Spare nunca retiene los fondos." },
      { icon: "flexible", title: "Flexible", body: "Un monto fijo o un redondeo, en wallets clásicas, Soroban o Ledger." },
    ],
  },
  cards: {
    integrate: { title: "Integra en tu app", body: "Añade la pregunta al checkout con el SDK y Spare Wallets Kit." },
    give: { title: "Aporta, si quieres", body: "Un monto fijo o un redondeo. Siempre se puede seguir sin aportar." },
    receive: { title: "Las fundaciones reciben", body: "El aporte llega directo a la fundación. El movimiento queda a la vista." },
  },
  how: {
    title: "Cómo funciona",
    docsLink: "Ver documentación",
    steps: [
      { title: "La app pregunta", body: "Al firmar, aparece la opción de sumar un poco o redondear." },
      { title: "Ellos deciden", body: "Aceptan, cambian el monto, o siguen. Nada se mueve sin su firma." },
      { title: "El registro es público", body: "La fundación recibe el aporte. El movimiento queda en el registro." },
    ],
  },
  footer: {
    ctaTitle: "Suma la pregunta al checkout.",
    ctaButton: "Leer la guía rápida",
    tagline: "Un kit de código abierto para un aporte pequeño al pagar. La persona siempre decide.",
    columns: [
      {
        title: "Producto",
        links: [
          { label: "SDK", href: "docs/spare-sdk" },
          { label: "Wallets Kit", href: "docs/spare-wallets-kit" },
          { label: "Registro", href: "docs/registry" },
          { label: "Tablero", href: "dashboard" },
        ],
      },
      {
        title: "Desarrolladores",
        links: [
          { label: "Docs", href: "docs" },
          { label: "Guía rápida", href: "docs/quick-start" },
          { label: "GitHub", href: "https://github.com/thesatieofcoding/Spare" },
          { label: "npm", href: "https://www.npmjs.com/package/spare-sdk" },
        ],
      },
      {
        title: "Fundaciones",
        links: [
          { label: "Registrar", href: "docs/registry#register" },
          { label: "Verificación", href: "docs/stellar-toml" },
          { label: "Directorio", href: "foundations" },
        ],
      },
    ],
    legal: "© 2026 Spare  ·  Licencia MIT",
    socialX: "Spare en X",
    socialGithub: "Spare en GitHub",
    characterAlt: "Una persona cargando una caja, vista desde arriba.",
  },
  docs: {
    sidebarLabel: "Documentación",
    tocTitle: "En esta página",
    codeLabel: "Ejemplo de código",
    copy: "Copiar",
    copied: "Copiado",
    pagerLabel: "Páginas de documentación",
    eyebrow: "Documentación",
  },
  faq: { eyebrow: "Preguntas", title: "Preguntas frecuentes", seeAll: "Ver todas las preguntas" },
  comingSoon: { title: "Próximamente", body: "Esta página está en camino.", back: "Volver al inicio" },
  pages: { docs: "Documentación", foundations: "Fundaciones", dashboard: "Tablero", demo: "Demo" },
};
