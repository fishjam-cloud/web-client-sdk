// Build-time Babel config, used only by react-native-builder-bob when compiling this package's
// own source to `dist` (bob is configured with `configFile: true`, so it defers entirely to this
// config instead of its default presets). It is never shipped — the published tarball is `dist`
// only — so it does not affect how consumers' Metro transpiles the built output.
//
// `@babel/preset-typescript` strips the TypeScript types. It preserves `'worklet'` string
// directives, which must survive into `dist` so the consumer app's react-native-worklets Babel
// plugin can pick them up. We deliberately do NOT run the worklets plugin here — that is the
// consumer's job at app-build time. (The TGSL shaders, which need unplugin-typegpu, live in
// @fishjam-cloud/react-native-custom-video-source, not here.)
module.exports = {
  presets: [['@babel/preset-typescript', { onlyRemoveTypeImports: true }]],
};
