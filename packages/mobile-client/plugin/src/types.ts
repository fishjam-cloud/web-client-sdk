export type FishjamPluginOptions =
  | {
      android?: {
        enableForegroundService?: boolean;
        enableScreensharing?: boolean;
        supportsPictureInPicture?: boolean;
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
