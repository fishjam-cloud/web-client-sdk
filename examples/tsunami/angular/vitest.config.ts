import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const configDirectory = dirname(fileURLToPath(import.meta.url));

// The behavioral suite runs against tsunami sources directly, matching the
// application build, so no package build step is needed while iterating.
export default defineConfig({
  resolve: {
    alias: {
      "@fishjam-cloud/tsunami": resolve(configDirectory, "../../../packages/tsunami/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/tests/**/*.spec.ts"],
  },
});
