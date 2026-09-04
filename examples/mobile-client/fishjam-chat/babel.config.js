module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // typegpu, reached through @fishjam-cloud/react-native-custom-video-source, ships static
      // class blocks, which babel-preset-expo does not transform on its own.
      '@babel/plugin-transform-class-static-block',
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          alias: {
            '@': '.',
          },
        },
      ],
    ],
  };
};
