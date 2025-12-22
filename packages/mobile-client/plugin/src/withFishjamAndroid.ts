import type { ConfigPlugin } from '@expo/config-plugins';
import { AndroidConfig, withAndroidManifest } from '@expo/config-plugins';
import { getMainApplicationOrThrow } from '@expo/config-plugins/build/android/Manifest';

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

const withFishjamForegroundService: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withAndroidManifest(config, async (configuration) => {
    if (!props?.android?.enableForegroundService) {
      return configuration;
    }

    const mainApplication = getMainApplicationOrThrow(configuration.modResults);
    mainApplication.service = mainApplication.service || [];

    const fishjamService = {
      $: {
        'android:name': 'com.oney.WebRTCModule.MediaProjectionService',
        'android:foregroundServiceType': 'camera|microphone|mediaProjection',
        'android:stopWithTask': 'true',
      },
    };

    const existingFishjamServiceIndex = mainApplication.service.findIndex(
      (service) => service.$['android:name'] === fishjamService.$['android:name'],
    );

    if (existingFishjamServiceIndex !== -1) {
      mainApplication.service[existingFishjamServiceIndex] = fishjamService;
    } else {
      mainApplication.service.push(fishjamService);
    }

    return configuration;
  });

const withFishjamForegroundServicePermission: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withAndroidManifest(config, (configuration) => {
    if (!props?.android?.enableForegroundService) {
      return configuration;
    }

    const mainApplication = configuration.modResults;
    if (!mainApplication.manifest) {
      return configuration;
    }

    if (!mainApplication.manifest['uses-permission']) {
      mainApplication.manifest['uses-permission'] = [];
    }

    const permissions = mainApplication.manifest['uses-permission'];

    const foregroundServicePermissions = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ];

    foregroundServicePermissions.forEach((permissionName) => {
      const hasPermission = permissions.some((perm) => perm.$?.['android:name'] === permissionName);

      if (!hasPermission) {
        permissions.push({
          $: {
            'android:name': permissionName,
          },
        });
      }
    });

    return configuration;
  });

export const withFishjamAndroid: ConfigPlugin<FishjamPluginOptions> = (config, props) => {
  config = withFishjamForegroundServicePermission(config, props);
  config = withFishjamForegroundService(config, props);
  config = withFishjamPictureInPicture(config, props);
  return config;
};
