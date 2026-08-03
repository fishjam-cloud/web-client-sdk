import { resolve } from "node:path";
import { defineConfig } from "vite";

// The example runs against tsunami sources directly so no package build step
// is needed while iterating.
export default defineConfig({
  server: {
    host: true,
    port: 3010,
  },
  resolve: {
    alias: {
      "@fishjam-cloud/tsunami": resolve(__dirname, "../../../packages/tsunami/src/index.ts"),
    },
  },
});
