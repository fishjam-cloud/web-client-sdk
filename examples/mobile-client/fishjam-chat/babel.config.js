module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      // typegpu, reached through @fishjam-cloud/video-effects, ships static class blocks, which
      // babel-preset-expo does not transform on its own.
      '@babel/plugin-transform-class-static-block',
      [
        'module-resolver',
        {
          alias: {
            '@': '.',
          },
        },
      ],
      // Compiles TypeGPU's tgpu.fn shader bodies to WGSL at build time.
      'unplugin-typegpu/babel',
      // Must stay last: the worklets plugin has to see the final output of the others.
      'react-native-reanimated/plugin',
    ],
  };
};
