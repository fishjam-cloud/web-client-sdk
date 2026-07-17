export type FishjamPluginOptions =
  | {
      android?: {
        enableForegroundService?: boolean;
        enableScreensharing?: boolean;
        supportsPictureInPicture?: boolean;
        enableVoip?: boolean;
        /**
         * Register the SDK's FCM messaging service (default `true`). Set to `false`
         * when the app ships its own dispatcher service that calls
         * `PushNotificationService.handleVoipMessage` / `handleNewToken`.
         */
        voipMessagingService?: boolean;
        /**
         * Messaging service that non-VoIP FCM messages and token callbacks are
         * relayed to. Pass a supported library name (`'expo-notifications'`,
         * `'@react-native-firebase/messaging'`) or a fully-qualified service class
         * name. Omit to disable relaying — without it, other push libraries won't
         * receive messages while VoIP is enabled.
         */
        voipFallbackMessagingService?: string;
      };
      ios?: {
        enableScreensharing?: boolean;
        supportsPictureInPicture?: boolean;
        broadcastExtensionTargetName?: string;
        broadcastExtensionDisplayName?: string;
        appGroupContainerId?: string;
        mainTargetName?: string;
        iphoneDeploymentTarget?: string;
        enableVoIPBackgroundMode?: boolean;
      };
      voip?: {
        incomingCallTimeout?: number;
        outgoingCallTimeout?: number;
        fulfillAnswerCallTimeout?: number;
        enableCallIntents?: boolean;
        notificationIcon?: string;
      };
    }
  | undefined;
