import type { ConfigPlugin } from '@expo/config-plugins';

import type { FishjamPluginOptions } from './types';

const withFishjam: ConfigPlugin<FishjamPluginOptions> = (config) => {
  return config;
};

export default withFishjam;
