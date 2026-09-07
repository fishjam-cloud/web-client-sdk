const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../../..');

const config = getDefaultConfig(projectRoot);

// @fishjam-cloud/video-effects is linked with `portal:`, so Metro has to watch its repo too.
const effectsRepository = path.resolve(
  monorepoRoot,
  '../fishjam-video-effects',
);

config.watchFolders = [monorepoRoot, effectsRepository];

// The segmentation weights ship as a .ssgbin file loaded through expo-asset.
config.resolver.assetExts = [...config.resolver.assetExts, 'ssgbin'];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// The workspace source packages dev-pin their own copies of these, and Metro's default lookup
// finds the nested copy first. Two instances of a native module is not a duplicated-code problem,
// it is a broken app: react-native's nested 0.85.3 emits codegen this app's babel plugin cannot
// parse, and a second react-native-webgpu re-registers its native view ("Tried to register two
// views with the same name WebGPUView"). Pin these to the root copy and leave every other
// package to resolve normally, so packages that rely on their own nested dependencies still can.
// Every native module here must resolve to exactly one copy: the JS half talks to a single
// installed pod, so a second copy from a package's nested node_modules reports a version
// mismatch and refuses to run ("Worklets 0.10.2 vs 0.8.1", "Nitro 0.35.7 vs 0.35.6").
const SINGLETON_MODULES = [
  'react',
  'react-native',
  'react-native-nitro-modules',
  'react-native-reanimated',
  'react-native-vision-camera',
  'react-native-vision-camera-worklets',
  'react-native-webgpu',
  'react-native-worklets',
  // Not native, but it keeps module-level registries: @fishjam-cloud/video-effects is linked with
  // `portal:`, which preserves its own node_modules, so TypeGPU otherwise loads twice.
  'typegpu',
];

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  const singleton = SINGLETON_MODULES.find(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  if (singleton) {
    const subPath = moduleName.slice(singleton.length);
    return resolve(
      context,
      path.resolve(monorepoRoot, 'node_modules', singleton) + subPath,
      platform,
    );
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
