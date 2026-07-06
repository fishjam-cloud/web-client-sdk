export type FishjamPluginOptions =
  | {
      android?: {
        enableForegroundService?: boolean;
        enableScreensharing?: boolean;
        supportsPictureInPicture?: boolean;
        /**
         * Adds the Telecom (VoIP calling) manifest entries: call permissions,
         * the incoming-call ring activity, the notification-action receiver,
         * and the foreground service that hosts the ongoing-call notification.
         * Leave off if your app doesn't implement calling.
         */
        enableVoip?: boolean;
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
    }
  | undefined;
