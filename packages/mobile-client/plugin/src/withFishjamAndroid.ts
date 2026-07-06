import type { ConfigPlugin } from '@expo/config-plugins';
import { AndroidConfig, withAndroidManifest } from '@expo/config-plugins';
import { getMainApplicationOrThrow } from '@expo/config-plugins/build/android/Manifest';

import type { FishjamPluginOptions } from './types';
import { withFishjamVoipAndroid } from './withFishjamVoip';

// The VoIP integration posts its ongoing-call notification through
// WebRTCForegroundService, so enabling VoIP implies the service (and its
// permissions) even when the app never enables the room foreground service.
const needsForegroundService = (props: FishjamPluginOptions) =>
  Boolean(props?.android?.enableForegroundService || props?.android?.enableVoip);

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
    if (!needsForegroundService(props)) {
      return configuration;
    }

    const mainApplication = getMainApplicationOrThrow(configuration.modResults);
    mainApplication.service = mainApplication.service || [];

    const foregroundServiceType = props?.android?.enableScreensharing
      ? 'camera|microphone|mediaProjection'
      : 'camera|microphone';

    const webRTCForegroundService = {
      $: {
        'android:name': 'com.oney.WebRTCModule.foregroundService.WebRTCForegroundService',
        'android:foregroundServiceType': foregroundServiceType,
        'android:stopWithTask': 'true',
      },
    };

    const existingWebRTCForegroundServiceIndex = mainApplication.service.findIndex(
      (service) => service.$['android:name'] === webRTCForegroundService.$['android:name'],
    );

    if (existingWebRTCForegroundServiceIndex !== -1) {
      mainApplication.service[existingWebRTCForegroundServiceIndex] = webRTCForegroundService;
    } else {
      mainApplication.service.push(webRTCForegroundService);
    }

    return configuration;
  });

const withFishjamForegroundServicePermission: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withAndroidManifest(config, (configuration) => {
    if (!needsForegroundService(props)) {
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
  config = withFishjamVoipAndroid(config, props);
  config = withFishjamPictureInPicture(config, props);
  return config;
};
