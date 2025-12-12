import type { ConfigPlugin } from '@expo/config-plugins';
import { AndroidConfig, withAndroidManifest } from '@expo/config-plugins';

import type { FishjamPluginOptions } from './types';

const withFishjamPictureInPicture: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withAndroidManifest(config, (configuration) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(configuration.modResults);

    if (props?.android?.supportsPictureInPicture) {
      activity.$['android:supportsPictureInPicture'] = 'true';
    } else {
      delete activity.$['android:supportsPictureInPicture'];
    }
    return configuration;
  });

export const withFishjamAndroid: ConfigPlugin<FishjamPluginOptions> = (config, props) => {
  config = withFishjamPictureInPicture(config, props);
  return config;
};
