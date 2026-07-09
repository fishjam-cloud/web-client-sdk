module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': '.',
          },
        },
      ],
      // PHASE 3a: TypeGPU's babel transform. Must run BEFORE the worklets plugin
      // so any TypeGPU codegen is in place before worklet extraction.
      'unplugin-typegpu/babel',
      // PHASE 3a: Reanimated 4 moved the worklet babel plugin into
      // react-native-worklets and it MUST be listed LAST. (Was previously
      // 'react-native-reanimated/plugin', which still works via a deprecated
      // re-export; switched to the canonical plugin for VisionCamera v5 frame
      // processors + worklet serialization to behave correctly.)
      'react-native-worklets/plugin',
    ],
  };
};
