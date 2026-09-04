const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
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
const SINGLETON_MODULES = ['react-native', 'react-native-webgpu', 'react'];

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
