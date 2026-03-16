import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: { resolve: true },
    clean: true,
    minify: true,
  },
  {
    entry: { 'index.react-native': 'src/index.ts' },
    format: ['esm'],
    noExternal: [/.*/],
    platform: 'browser',
    splitting: false,
    minify: true,
  },
]);
