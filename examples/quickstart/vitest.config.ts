import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (pkg: string) => fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    // Import the packages by name, like an adopter, but resolve them from workspace source.
    alias: { "spare-sdk": src("spare-sdk"), "spare-wallets-kit": src("spare-wallets-kit") },
  },
  test: { environment: "happy-dom" },
});
