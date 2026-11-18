import { fileURLToPath } from "node:url";
import { getViteConfig } from "astro/config";

const src = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// getViteConfig loads the Astro vite plugins so component tests can render .astro files
// through the container API. Aliases mirror astro.config.mjs.
export default getViteConfig({
  resolve: {
    alias: {
      "spare-sdk": src("../../packages/spare-sdk/src/index.ts"),
      "spare-wallets-kit": src("../../packages/spare-wallets-kit/src/index.ts"),
      "spare-indexer": src("../../packages/spare-indexer/src"),
    },
  },
  // @ts-expect-error vitest's `test` key is not in vite's UserConfig type
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
