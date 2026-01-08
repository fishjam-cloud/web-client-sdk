const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// TODO:FCE-2585: Force React to resolve React from local node_modules
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'react') {
        return {
            filePath: require.resolve(moduleName, {
                paths: [path.resolve(__dirname, 'node_modules')]
            }),
            type: 'sourceFile',
        };
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;