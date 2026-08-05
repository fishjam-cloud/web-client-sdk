import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@fishjam-cloud/tsunami/testing": fileURLToPath(new URL("../tsunami/src/testing/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/tests/support/setup.ts"],
  },
});
