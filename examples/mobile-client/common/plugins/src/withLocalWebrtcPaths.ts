/* eslint-disable no-console */
import type { ConfigPlugin } from "@expo/config-plugins";

import { detectLocalWebrtcPath } from "./utils";
import { withLocalWebrtcAndroid } from "./withLocalWebrtcAndroid";
import { withLocalWebrtcIos } from "./withLocalWebrtcIos";

export type LocalWebrtcPathsOptions =
  | {
      /**
       * Optional: Local path to react-native-webrtc fork for development.
       * If not provided, the plugin will try to detect from package.json.
       */
      webrtcLocalPath?: string;
    }
  | undefined;

const withLocalWebrtcPaths: ConfigPlugin<LocalWebrtcPathsOptions> = (
  config,
  options = {}
) => {
  const localPath = options?.webrtcLocalPath ?? detectLocalWebrtcPath();

  if (localPath) {
    console.log(
      `🔧 [local-webrtc-paths] Using local WebRTC path: ${localPath}`
    );
    config = withLocalWebrtcIos(config, { localPath });
    config = withLocalWebrtcAndroid(config, { localPath });
  } else {
    console.log(
      `📦 [local-webrtc-paths] No local path detected, using published WebRTC`
    );
  }

  return config;
};

export default withLocalWebrtcPaths;
