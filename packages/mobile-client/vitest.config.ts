import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fishjam-cloud/tsunami': fileURLToPath(new URL('../tsunami/src/index.ts', import.meta.url)),
    },
  },
});
