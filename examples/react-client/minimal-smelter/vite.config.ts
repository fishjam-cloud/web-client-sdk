import { createRequire } from "node:module";
import path from "node:path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import { viteStaticCopy } from "vite-plugin-static-copy";
// import mkcert from "vite-plugin-mkcert";

const require = createRequire(import.meta.url);

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    // https://vitejs.dev/config/server-options.html#server-host
    // true - listen on all addresses, including LAN and public addresses
    host: true,
    // https: true,
    port: 3008,
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: path.join(
            path.dirname(require.resolve("@swmansion/smelter-browser-render")),
            "smelter.wasm",
          ),
          dest: "assets",
        },
      ],
    }),
    checker({
      typescript: true,
      eslint: {
        lintCommand: "eslint --ext .ts,.tsx",
      },
    }),
    // mkcert(),
  ],
  optimizeDeps: {
    exclude: ["@swmansion/smelter-web-wasm"],
    include: ["@swmansion/smelter-web-wasm > pino"],
  },
});
