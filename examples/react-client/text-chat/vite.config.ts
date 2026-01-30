import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import checker from "vite-plugin-checker";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
    port: 3010,
  },
  plugins: [
    react(),
    checker({
      typescript: true,
      eslint: {
        lintCommand: "eslint --ext .ts,.tsx",
      },
    }),
  ],
});
