import { defineConfig } from 'vitest/config';

export default defineConfig({
  // React Native defines __DEV__ at runtime; tests run the production branch.
  define: { __DEV__: 'false' },
});
