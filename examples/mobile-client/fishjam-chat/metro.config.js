// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// react-native-executorch ships model/tokenizer files as .pte / .bin assets;
// Metro must treat them as assets so they can be bundled/resolved.
config.resolver.assetExts.push('pte', 'bin');

module.exports = config;
