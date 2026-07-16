import type { ConfigPlugin } from '@expo/config-plugins';
import { withAndroidManifest } from '@expo/config-plugins';
import { getMainApplicationOrThrow } from '@expo/config-plugins/build/android/Manifest';

import type { FishjamPluginOptions } from './types';

/**
 * Manifest entries required by the Android Telecom (VoIP calling) integration.
 * Opt in with `android.enableVoip`.
 *
 * - MANAGE_OWN_CALLS: required to register calls with Telecom via
 *   androidx.core.telecom CallsManager.
 * - POST_NOTIFICATIONS: the incoming/ongoing CallStyle notifications.
 * - USE_FULL_SCREEN_INTENT: the incoming-call ring screen over the lock screen.
 * - VIBRATE: the looping ring vibration driven while an incoming call rings.
 */
const VOIP_PERMISSIONS = [
  'android.permission.MANAGE_OWN_CALLS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.VIBRATE',
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

// FCM service that receives VoIP wake-up pushes and reports the call to Telecom.
// Declared here (app manifest) so non-calling apps pull in neither it nor Firebase.
const MESSAGING_SERVICE = {
  '$': {
    'android:name': 'com.oney.WebRTCModule.voip.PushNotificationService',
    'android:exported': 'false' as const,
  },
  'intent-filter': [
    {
      action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
    },
  ],
};

const INSTALLATION_ID_META = {
  $: {
    'android:name': 'firebase_messaging_installation_id_enabled',
    'android:value': 'true',
  },
};

const VOIP_TIMEOUTS = [
  ['VoipIncomingCallTimeout', 'incomingCallTimeout'],
  ['VoipOutgoingCallTimeout', 'outgoingCallTimeout'],
  ['VoipFulfillAnswerTimeout', 'fulfillAnswerCallTimeout'],
] as const;

const NOTIFICATION_ICON_META_NAME = 'VoipNotificationIcon';
// The CallStyle notification's small icon defaults to the app's launcher icon.
const DEFAULT_NOTIFICATION_ICON = '@mipmap/ic_launcher';

function validateTimeout(name: string, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Fishjam VoIP ${name} must be a positive finite number of seconds.`);
  }
}

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

    mainApplication.service = mainApplication.service || [];
    const serviceName = MESSAGING_SERVICE.$['android:name'];
    const existingServiceIndex = mainApplication.service.findIndex(
      (service) => service.$['android:name'] === serviceName,
    );
    if (existingServiceIndex !== -1) {
      mainApplication.service[existingServiceIndex] = MESSAGING_SERVICE;
    } else {
      mainApplication.service.push(MESSAGING_SERVICE);
    }

    const metadataEntries = mainApplication['meta-data'] || [];
    mainApplication['meta-data'] = metadataEntries;
    const metaName = INSTALLATION_ID_META.$['android:name'];
    const existingMetaIndex = metadataEntries.findIndex((meta) => meta.$['android:name'] === metaName);
    if (existingMetaIndex !== -1) {
      metadataEntries[existingMetaIndex] = INSTALLATION_ID_META;
    } else {
      metadataEntries.push(INSTALLATION_ID_META);
    }

    VOIP_TIMEOUTS.forEach(([key, option]) => {
      const seconds = props?.voip?.[option];
      if (seconds === undefined) {
        return;
      }
      validateTimeout(option, seconds);
      const timeoutMetadata = {
        $: {
          'android:name': key,
          'android:value': String(Math.floor(seconds)),
        },
      };
      const existingTimeoutIndex = metadataEntries.findIndex((meta) => meta.$['android:name'] === key);
      if (existingTimeoutIndex !== -1) {
        metadataEntries[existingTimeoutIndex] = timeoutMetadata;
      } else {
        metadataEntries.push(timeoutMetadata);
      }
    });

    // CallStyle notification small icon; defaults to the app's launcher icon.
    const notificationIconMetadata = {
      $: {
        'android:name': NOTIFICATION_ICON_META_NAME,
        'android:resource': props?.voip?.notificationIcon ?? DEFAULT_NOTIFICATION_ICON,
      },
    };
    const existingIconIndex = metadataEntries.findIndex(
      (meta) => meta.$['android:name'] === NOTIFICATION_ICON_META_NAME,
    );
    if (existingIconIndex !== -1) {
      metadataEntries[existingIconIndex] = notificationIconMetadata;
    } else {
      metadataEntries.push(notificationIconMetadata);
    }

    return configuration;
  });
