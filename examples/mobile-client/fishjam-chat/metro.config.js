const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The segmentation model of @fishjam-cloud/video-effects ships as a .ssgbin asset.
config.resolver.assetExts = [...config.resolver.assetExts, 'ssgbin'];

module.exports = config;
