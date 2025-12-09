import { ConfigPlugin, withPodfile } from '@expo/config-plugins';
import { INFO_GENERATED_COMMENT_IOS } from './utils';

const removeGeneratedBlock = (content: string): string => {
  const marker = INFO_GENERATED_COMMENT_IOS.trim().split('\n')[0];
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\n?\\s*${escapedMarker}[\\s\\S]*?(?=\\n[^\\s#]|$)`, 'g');
  return content.replace(regex, '');
};

export const withLocalWebrtcIos: ConfigPlugin<{ localPath: string }> = (config, { localPath }) => {
  return withPodfile(config, (configuration) => {
    let podfile = configuration.modResults.contents;

    // Remove any previously generated blocks
    podfile = removeGeneratedBlock(podfile);

    // Find the main target and add the local pod path
    // This overrides the autolinking for this specific pod
    const targetMatch = podfile.match(/target ['"](.+?)['"] do/);
    if (targetMatch) {
      const targetName = targetMatch[1];
      podfile = podfile.replace(
        new RegExp(`target ['"]${targetName}['"] do`),
        (match) =>
          `${match}\n  ${INFO_GENERATED_COMMENT_IOS}\n  pod 'FishjamReactNativeWebrtc', :path => '${localPath}'`,
      );
    }

    configuration.modResults.contents = podfile;
    return configuration;
  });
};
