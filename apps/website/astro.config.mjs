import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

// Resolve workspace packages from source so the build needs no prior package build.
const src = (rel) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  site: "https://donatespare.xyz",
  output: "static",
  trailingSlash: "always",
  redirects: { "/": "/en/" },
  vite: {
    resolve: {
      alias: {
        "spare-sdk": src("../../packages/spare-sdk/src/index.ts"),
        "spare-wallets-kit": src("../../packages/spare-wallets-kit/src/index.ts"),
      },
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es"],
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
});
