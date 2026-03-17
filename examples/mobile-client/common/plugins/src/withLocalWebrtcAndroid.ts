import { ConfigPlugin, withSettingsGradle } from "@expo/config-plugins";
import { INFO_GENERATED_COMMENT_ANDROID } from "./utils";

const removeGeneratedBlock = (content: string): string => {
  const marker = INFO_GENERATED_COMMENT_ANDROID.trim().split("\n")[0];
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `\\n?\\s*${escapedMarker}[\\s\\S]*?(?=\\n[^\\s#/]|$)`,
    "g",
  );
  return content.replace(regex, "");
};

export const withLocalWebrtcAndroid: ConfigPlugin<{ localPath: string }> = (
  config,
  { localPath },
) => {
  return withSettingsGradle(config, (configuration) => {
    let settings = configuration.modResults.contents;

    // Remove any previously generated blocks
    settings = removeGeneratedBlock(settings);

    // Add local project reference
    settings += `
${INFO_GENERATED_COMMENT_ANDROID}
include ':fishjam-cloud_react-native-webrtc'
project(':fishjam-cloud_react-native-webrtc').projectDir = new File('${localPath}/android')
`;

    configuration.modResults.contents = settings;
    return configuration;
  });
};
