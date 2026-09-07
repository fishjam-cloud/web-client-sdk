// Build-time Babel config, used only by react-native-builder-bob when compiling this package's
// own source to `dist`. `@babel/preset-typescript` strips the types and preserves `'worklet'`
// string directives, which must survive into `dist` so the consumer app's react-native-worklets
// Babel plugin can pick them up. The worklets plugin itself is the consumer's job at app-build time.
module.exports = {
  presets: [['@babel/preset-typescript', { onlyRemoveTypeImports: true }]],
};
