import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
// import mkcert from "vite-plugin-mkcert";

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    // @fishjam-cloud/react-client is a workspace link and @fishjam-cloud/video-effects imports it as a
    // peer; without dedupe Vite hands the two a different copy and the hooks lose the provider context.
    dedupe: ["react", "react-dom", "@fishjam-cloud/react-client"],
  },
  optimizeDeps: {
    // Pre-bundling the linked package would split its main entry from `/debug`.
    exclude: ["@fishjam-cloud/react-client"],
  },
  server: {
    // https://vitejs.dev/config/server-options.html#server-host
    // true - listen on all addresses, including LAN and public addresses
    host: true,
    // https: true,
    port: 3007,
  },
  plugins: [
    react(),
    checker({
      typescript: true,
      eslint: {
        lintCommand: "eslint --ext .ts,.tsx",
      },
    }),
    // mkcert(),
  ],
});
