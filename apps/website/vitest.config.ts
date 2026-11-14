import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "spare-sdk": src("../../packages/spare-sdk/src/index.ts"),
      "spare-wallets-kit": src("../../packages/spare-wallets-kit/src/index.ts"),
    },
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
