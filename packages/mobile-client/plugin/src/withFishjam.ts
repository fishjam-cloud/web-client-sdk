import { ConfigPlugin } from '@expo/config-plugins';
import { withFishjamAndroid } from './withFishjamAndroid';
import { FishjamPluginOptions } from './types';
import withFishjamIos from './withFishjamIos';

/**
 * Main Fishjam Expo config plugin.
 *
 * This plugin configures both iOS and Android platforms for Picture-in-Picture support.
 *
 * ## Usage
 *
 * ```json
 * {
 *   "plugins": [
 *     [
 *       "@fishjam-cloud/mobile-client",
 *       {
 *         "android": {
 *           "supportsPictureInPicture": true
 *         },
 *         "ios": {
 *           "supportsPictureInPicture": true
 *         }
 *       }
 *     ]
 *   ]
 * }
 * ```
 *
 * @param config - Expo config object
 * @param options - Plugin configuration options
 * @returns Modified config object
 */
const withFishjam: ConfigPlugin<FishjamPluginOptions> = (config, options) => {
  config = withFishjamAndroid(config, options);
  config = withFishjamIos(config, options);
  return config;
};

export default withFishjam;
