import type { ConfigPlugin } from '@expo/config-plugins';
import { withAndroidManifest } from '@expo/config-plugins';
import type { AndroidManifest } from '@expo/config-plugins/build/android/Manifest';
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

const MESSAGING_SERVICE = {
  '$': {
    'android:name': 'com.oney.WebRTCModule.voip.PushNotificationService',
    'android:exported': 'false' as const,
  },
  'intent-filter': [
    {
      $: { 'android:priority': '1' },
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

const FALLBACK_META_NAME = 'VoipFallbackMessagingService';

/**
 * Library names accepted by `android.voipFallbackMessagingService`, mapped to
 * their FCM service class. These services come from **library** manifests, so on
 * top of configuring the relay we re-declare them with tools:node="replace" and
 * no intent-filter: the library's MESSAGING_EVENT filter is dropped (FCM routing
 * stays deterministic) while the manifest entry keeps R8 from stripping the
 * reflectively-loaded class in minified builds.
 */
const KNOWN_FALLBACK_SERVICES: Record<string, string> = {
  'expo-notifications': 'expo.modules.notifications.service.ExpoFirebaseMessagingService',
  '@react-native-firebase/messaging': 'io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService',
};

type FallbackMessagingService = {
  className: string;
  // true when resolved from KNOWN_FALLBACK_SERVICES
  knownLibrary: boolean;
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

function resolveFallbackMessagingService(props: FishjamPluginOptions): FallbackMessagingService | null {
  const option = props?.android?.voipFallbackMessagingService;
  if (!option) {
    return null;
  }
  const known = KNOWN_FALLBACK_SERVICES[option];
  if (known) {
    return { className: known, knownLibrary: true };
  }
  if (option.includes('.')) {
    return { className: option, knownLibrary: false };
  }
  throw new Error(
    `Fishjam VoIP: unknown voipFallbackMessagingService '${option}'. ` +
      `Use one of ${Object.keys(KNOWN_FALLBACK_SERVICES).join(', ')} ` +
      `or a fully-qualified FirebaseMessagingService class name.`,
  );
}

/** Applies every VoIP manifest change. */
function applyVoipManifest(
  androidManifest: AndroidManifest,
  props: FishjamPluginOptions,
  fallbackService: FallbackMessagingService | null,
): AndroidManifest {
  const manifest = androidManifest.manifest;
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

  const mainApplication = getMainApplicationOrThrow(androidManifest);

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
  if (props?.android?.voipMessagingService !== false) {
    // Cast: ManifestIntentFilter's typing omits android:priority, which is valid XML.
    upsertService(mainApplication.service, MESSAGING_SERVICE as unknown as ManifestService);

    if (fallbackService?.knownLibrary) {
      manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
      upsertService(mainApplication.service, {
        $: {
          'android:name': fallbackService.className,
          'tools:node': 'replace',
        },
      } as unknown as ManifestService);
    }
  }

  const metadataEntries = mainApplication['meta-data'] || [];
  mainApplication['meta-data'] = metadataEntries;

  const upsertMeta = (entry: ManifestMetaData) => {
    const existingIndex = metadataEntries.findIndex((meta) => meta.$['android:name'] === entry.$['android:name']);
    if (existingIndex !== -1) {
      metadataEntries[existingIndex] = entry;
    } else {
      metadataEntries.push(entry);
    }
  };

  upsertMeta(INSTALLATION_ID_META);

  if (props?.android?.voipMessagingService !== false && fallbackService) {
    upsertMeta({
      $: {
        'android:name': FALLBACK_META_NAME,
        'android:value': fallbackService.className,
      },
    });
  }

  VOIP_TIMEOUTS.forEach(([key, option]) => {
    const seconds = props?.voip?.[option];
    if (seconds === undefined) {
      return;
    }
    validateTimeout(option, seconds);
    upsertMeta({
      $: {
        'android:name': key,
        'android:value': String(Math.floor(seconds)),
      },
    });
  });

  // CallStyle notification small icon; defaults to the app's launcher icon.
  upsertMeta({
    $: {
      'android:name': NOTIFICATION_ICON_META_NAME,
      'android:resource': props?.voip?.notificationIcon ?? DEFAULT_NOTIFICATION_ICON,
    },
  });

  return androidManifest;
}

type ManifestService = NonNullable<ReturnType<typeof getMainApplicationOrThrow>['service']>[number];
type ManifestMetaData = NonNullable<ReturnType<typeof getMainApplicationOrThrow>['meta-data']>[number];

function upsertService(services: ManifestService[], entry: ManifestService): void {
  const existingIndex = services.findIndex((service) => service.$?.['android:name'] === entry.$?.['android:name']);
  if (existingIndex !== -1) {
    services[existingIndex] = entry;
  } else {
    services.push(entry);
  }
}

export const withFishjamVoipAndroid: ConfigPlugin<FishjamPluginOptions> = (config, props) => {
  if (!props?.android?.enableVoip) {
    return config;
  }
  const fallbackService = resolveFallbackMessagingService(props);
  return withAndroidManifest(config, (configuration) => {
    applyVoipManifest(configuration.modResults, props, fallbackService);
    return configuration;
  });
};
