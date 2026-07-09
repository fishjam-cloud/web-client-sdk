// PHASE 3b — Metro config.
//
// The only project-specific need is registering binary MODEL WEIGHTS as ASSETS
// so `require('...model file')` resolves to a downloadable asset instead of
// Metro trying to parse it as a source module:
//   - `.pte` — the MediaPipe hand detector + hand landmark models exported as
//     ExecuTorch programs (under `assets/models/`), run by
//     react-native-executorch for charades.
//
// This extends Expo's default config (which already enables monorepo support);
// if a metro.config.js is added/changed in the main checkout for other reasons,
// merge this single `assetExts` addition into it.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = [...config.resolver.assetExts, 'pte'];

module.exports = config;
