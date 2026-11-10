import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve the workspace SDK from source so tests do not need a prior build.
    alias: { "spare-sdk": fileURLToPath(new URL("../spare-sdk/src/index.ts", import.meta.url)) },
  },
  test: { environment: "happy-dom" },
});
