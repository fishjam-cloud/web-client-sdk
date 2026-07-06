import type { ConfigPlugin } from '@expo/config-plugins';
import { withAndroidManifest } from '@expo/config-plugins';
import { getMainApplicationOrThrow } from '@expo/config-plugins/build/android/Manifest';

import type { FishjamPluginOptions } from './types';

/**
 * Manifest entries required by the Android Telecom (VoIP calling) integration.
 *
 * These deliberately live in the app's manifest (injected here) instead of the
 * react-native-webrtc library manifest, so SDK users who don't build a calling
 * app never declare call-related permissions or components. Opt in with
 * `android.enableVoip`.
 *
 * - MANAGE_OWN_CALLS: required to register calls with Telecom via
 *   androidx.core.telecom CallsManager.
 * - POST_NOTIFICATIONS: the incoming/ongoing CallStyle notifications.
 * - USE_FULL_SCREEN_INTENT: the incoming-call ring screen over the lock screen.
 *   (The ongoing-call notification is posted by the foreground service and
 *   does not use a full-screen intent.)
 */
const VOIP_PERMISSIONS = [
  'android.permission.MANAGE_OWN_CALLS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.USE_FULL_SCREEN_INTENT',
];

const INCOMING_CALL_ACTIVITY = {
  $: {
    'android:name': 'com.oney.WebRTCModule.voip.IncomingCallActivity',
    'android:exported': 'false' as const,
    'android:showWhenLocked': 'true',
    'android:turnScreenOn': 'true',
    'android:launchMode': 'singleInstance',
    'android:excludeFromRecents': 'true',
    'android:taskAffinity': '',
    'android:theme': '@android:style/Theme.Black.NoTitleBar.Fullscreen',
  },
};

const END_CALL_RECEIVER = {
  $: {
    'android:name': 'com.oney.WebRTCModule.voip.EndCallNotificationReceiver',
    'android:exported': 'false' as const,
  },
};

export const withFishjamVoipAndroid: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withAndroidManifest(config, (configuration) => {
    if (!props?.android?.enableVoip) {
      return configuration;
    }

    const manifest = configuration.modResults.manifest;
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const permissions = manifest['uses-permission'];

    VOIP_PERMISSIONS.forEach((permissionName) => {
      const hasPermission = permissions.some((perm) => perm.$?.['android:name'] === permissionName);
      if (!hasPermission) {
        permissions.push({ $: { 'android:name': permissionName } });
      }
    });

    const mainApplication = getMainApplicationOrThrow(configuration.modResults);

    mainApplication.activity = mainApplication.activity || [];
    const activityName = INCOMING_CALL_ACTIVITY.$['android:name'];
    const existingActivityIndex = mainApplication.activity.findIndex(
      (activity) => activity.$['android:name'] === activityName,
    );
    if (existingActivityIndex !== -1) {
      mainApplication.activity[existingActivityIndex] = INCOMING_CALL_ACTIVITY;
    } else {
      mainApplication.activity.push(INCOMING_CALL_ACTIVITY);
    }

    mainApplication.receiver = mainApplication.receiver || [];
    const receiverName = END_CALL_RECEIVER.$['android:name'];
    const existingReceiverIndex = mainApplication.receiver.findIndex(
      (receiver) => receiver.$['android:name'] === receiverName,
    );
    if (existingReceiverIndex !== -1) {
      mainApplication.receiver[existingReceiverIndex] = END_CALL_RECEIVER;
    } else {
      mainApplication.receiver.push(END_CALL_RECEIVER);
    }

    return configuration;
  });
