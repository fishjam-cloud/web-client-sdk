import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
// import mkcert from 'vite-plugin-mkcert'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    // https://vitejs.dev/config/server-options.html#server-host
    // true - listen on all addresses, including LAN and public addresses
    // host: true,
    // https: true,
    port: 3005,
  },
  plugins: [
    checker({
      typescript: true,
      eslint: {
        lintCommand: "eslint --ext .ts",
      }
    }),
    // mkcert(),
  ],
});
