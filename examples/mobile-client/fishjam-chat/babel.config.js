module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      '@babel/plugin-transform-class-static-block',
      [
        'module-resolver',
        {
          alias: {
            '@': '.',
          },
        },
      ],
      'unplugin-typegpu/babel',
      'react-native-reanimated/plugin',
    ],
  };
};
