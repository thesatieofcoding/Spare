import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://spare-vert.vercel.app",
  output: "static",
  trailingSlash: "always",
  redirects: { "/": "/en/" },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es"],
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
});
