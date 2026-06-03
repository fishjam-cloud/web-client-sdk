export type FishjamPluginOptions =
  | {
      android?: {
        enableForegroundService?: boolean;
        enableScreensharing?: boolean;
        supportsPictureInPicture?: boolean;
      };
      ios?: {
        enableScreensharing?: boolean;
        /**
         * Enables a dedicated broadcast extension that owns the whole WebRTC pipeline
         * (capture -> encode -> WHIP publish) in-process, so a standalone livestream
         * screen share keeps streaming while the app is backgrounded. Independent of
         * `enableScreensharing` (the in-call extension); both can be enabled together.
         */
        enableLivestreamScreensharing?: boolean;
        supportsPictureInPicture?: boolean;
        broadcastExtensionTargetName?: string;
        broadcastExtensionDisplayName?: string;
        livestreamExtensionTargetName?: string;
        livestreamExtensionDisplayName?: string;
        appGroupContainerId?: string;
        mainTargetName?: string;
        iphoneDeploymentTarget?: string;
        enableVoIPBackgroundMode?: boolean;
      };
    }
  | undefined;
