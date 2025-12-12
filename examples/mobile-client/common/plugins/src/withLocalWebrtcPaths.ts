import type { ConfigPlugin } from '@expo/config-plugins';
import { detectLocalWebrtcPath } from './utils';
import { withLocalWebrtcIos } from './withLocalWebrtcIos';
import { withLocalWebrtcAndroid } from './withLocalWebrtcAndroid';

export type LocalWebrtcPathsOptions =
  | {
      /**
       * Optional: Local path to react-native-webrtc fork for development.
       * If not provided, the plugin will try to detect from package.json.
       */
      webrtcLocalPath?: string;
    }
  | undefined;

const withLocalWebrtcPaths: ConfigPlugin<LocalWebrtcPathsOptions> = (config, options = {}) => {
  // Detect or use provided local path
  const projectRoot = (config as { _internal?: { projectRoot?: string } })._internal?.projectRoot ?? process.cwd();
  const localPath = options?.webrtcLocalPath ?? detectLocalWebrtcPath(projectRoot);

  if (localPath) {
    console.log(`🔧 [local-webrtc-paths] Using local WebRTC path: ${localPath}`);
    config = withLocalWebrtcIos(config, { localPath });
    config = withLocalWebrtcAndroid(config, { localPath });
  } else {
    console.log(`📦 [local-webrtc-paths] No local path detected, using published WebRTC`);
  }

  return config;
};

export default withLocalWebrtcPaths;
