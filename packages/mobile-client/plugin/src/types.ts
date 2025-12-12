export type FishjamPluginOptions =
  | {
      android?: {
        supportsPictureInPicture?: boolean;
      };
      ios?: {
        supportsPictureInPicture?: boolean;
      };
    }
  | undefined;
