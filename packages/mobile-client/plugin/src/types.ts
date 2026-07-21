export type FishjamPluginOptions =
  | {
      android?: {
        enableForegroundService?: boolean;
        enableScreensharing?: boolean;
        supportsPictureInPicture?: boolean;
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
      voip?: {
        incomingCallTimeout?: number;
        outgoingCallTimeout?: number;
        fulfillAnswerCallTimeout?: number;
        enableCallIntents?: boolean;
        notificationIcon?: string;
      };
    }
  | undefined;
