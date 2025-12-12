import { ConfigPlugin, withInfoPlist } from '@expo/config-plugins';
import { FishjamPluginOptions } from './types';

const withFishjamPictureInPicture: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withInfoPlist(config, (configuration) => {
    if (props?.ios?.supportsPictureInPicture) {
      const backgroundModes = new Set(configuration.modResults.UIBackgroundModes ?? []);
      backgroundModes.add('audio');
      configuration.modResults.UIBackgroundModes = Array.from(backgroundModes);
    }

    return configuration;
  });

const withFishjamIos: ConfigPlugin<FishjamPluginOptions> = (config, props) => {
  config = withFishjamPictureInPicture(config, props);
  return config;
};

export default withFishjamIos;
