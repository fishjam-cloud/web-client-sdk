import type { ConfigPlugin } from '@expo/config-plugins';
import {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withPodfileProperties,
  withXcodeProject,
} from '@expo/config-plugins';
import * as fs from 'fs/promises';
import * as path from 'path';

import type { FishjamPluginOptions } from './types';

function getSbeTargetName(props: FishjamPluginOptions) {
  return props?.ios?.broadcastExtensionTargetName || 'ScreenBroadcastExtension';
}

function getSbeDisplayName(props: FishjamPluginOptions) {
  return props?.ios?.broadcastExtensionDisplayName || 'ScreenBroadcast';
}

function getLivestreamTargetName(props: FishjamPluginOptions) {
  return props?.ios?.livestreamExtensionTargetName || 'ScreenLivestreamExtension';
}

function getLivestreamDisplayName(props: FishjamPluginOptions) {
  return props?.ios?.livestreamExtensionDisplayName || 'ScreenLivestream';
}

// Keep in sync with FishjamReactNativeWebrtc.podspec (s.dependency 'FishjamWebRTC').
const FISHJAM_WEBRTC_POD_VERSION = '~> 124.0.2.0';

const TARGETED_DEVICE_FAMILY = `"1,2"`;
const IPHONEOS_DEPLOYMENT_TARGET = '15.1';
const GROUP_IDENTIFIER_TEMPLATE_REGEX = /{{GROUP_IDENTIFIER}}/gm;
const BUNDLE_IDENTIFIER_TEMPLATE_REGEX = /{{BUNDLE_IDENTIFIER}}/gm;
const DISPLAY_NAME_TEMPLATE_REGEX = /{{DISPLAY_NAME}}/gm;

/**
 * A helper function for updating a value in a file for given regex
 */
async function updateFileWithRegex(
  iosPath: string,
  fileName: string,
  regex: RegExp,
  value: string,
  props: FishjamPluginOptions,
  targetNameOverride?: string,
) {
  const targetName = targetNameOverride ?? getSbeTargetName(props);
  const filePath = `${iosPath}/${targetName}/${fileName}`;
  let file = await fs.readFile(filePath, { encoding: 'utf-8' });
  file = file.replace(regex, value);
  await fs.writeFile(filePath, file);
}

/**
 * Adds "App Group" permission
 * App Group allows your app and the ScreenBroadcastExtension to communicate with each other.
 */
const withAppGroupPermissions: ConfigPlugin<FishjamPluginOptions> = (config, props) => {
  const APP_GROUP_KEY = 'com.apple.security.application-groups';
  const bundleIdentifier = config.ios?.bundleIdentifier || '';
  const groupIdentifier = props?.ios?.appGroupContainerId || `group.${bundleIdentifier}`;
  const mainTarget = props?.ios?.mainTargetName || '';

  config.ios ??= {};
  config.ios.entitlements ??= {};
  config.ios.entitlements[APP_GROUP_KEY] ??= [];

  const entitlementsArray = config.ios.entitlements[APP_GROUP_KEY] as string[];
  if (!entitlementsArray.includes(groupIdentifier)) {
    entitlementsArray.push(groupIdentifier);
  }

  config = withEntitlementsPlist(config, (newConfig) => {
    const modResultsArray = (newConfig.modResults[APP_GROUP_KEY] as string[]) || [];
    if (!modResultsArray.includes(groupIdentifier)) {
      modResultsArray.push(groupIdentifier);
    }
    newConfig.modResults[APP_GROUP_KEY] = modResultsArray;
    return newConfig;
  });

  // eslint-disable-next-line no-shadow
  config = withXcodeProject(config, (props) => {
    const xcodeProject = props.modResults;
    const targets = xcodeProject.getFirstTarget();
    const project = xcodeProject.getFirstProject();

    if (!targets || !project) {
      return props;
    }

    const targetUuid = targets.uuid;
    const projectUuid = project.uuid;

    const projectObj = xcodeProject.hash.project.objects.PBXProject[projectUuid];
    projectObj.attributes ??= {};
    projectObj.attributes.TargetAttributes ??= {};
    projectObj.attributes.TargetAttributes[targetUuid] ??= {};
    projectObj.attributes.TargetAttributes[targetUuid].SystemCapabilities ??= {};

    projectObj.attributes.TargetAttributes[targetUuid].SystemCapabilities['com.apple.ApplicationGroups.iOS'] = {
      enabled: 1,
    };

    const mainTargetName = mainTarget || props.modRequest.projectName;
    const entitlementsFilePath = `${mainTargetName}/${mainTargetName}.entitlements`;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();

    Object.keys(configurations).forEach((key) => {
      // eslint-disable-next-line no-shadow
      const config = configurations[key];
      if (config.buildSettings?.PRODUCT_NAME?.includes(mainTargetName)) {
        if (!config.buildSettings.CODE_SIGN_ENTITLEMENTS) {
          config.buildSettings.CODE_SIGN_ENTITLEMENTS = entitlementsFilePath;
        }
      }
    });

    return props;
  });

  return config;
};

/**
 * Adds constants to Info.plist
 * In order to dynamically retrieve extension's bundleId and group name we need to store it in Info.plist.
 */
const withInfoPlistConstants: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withInfoPlist(config, (configuration) => {
    const bundleIdentifier = configuration.ios?.bundleIdentifier || '';
    const groupIdentifier = props?.ios?.appGroupContainerId || `group.${bundleIdentifier}`;
    configuration.modResults['RTCScreenSharingExtension'] = `${bundleIdentifier}.${getSbeTargetName(props)}`;
    configuration.modResults['RTCAppGroupIdentifier'] = groupIdentifier;
    return configuration;
  });

/**
 * Adds the livestream extension constants to the main app's Info.plist.
 * `RTCLivestreamExtension` is a separate key from `RTCScreenSharingExtension` so the
 * livestream extension and the in-call extension coexist and are selected independently
 * by the native broadcast picker.
 */
const withLivestreamInfoPlistConstants: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withInfoPlist(config, (configuration) => {
    const bundleIdentifier = configuration.ios?.bundleIdentifier || '';
    const groupIdentifier = props?.ios?.appGroupContainerId || `group.${bundleIdentifier}`;
    configuration.modResults['RTCLivestreamExtension'] = `${bundleIdentifier}.${getLivestreamTargetName(props)}`;
    configuration.modResults['RTCAppGroupIdentifier'] = groupIdentifier;
    return configuration;
  });

/**
 * Updates and copies required extension files.
 * Our extension needs to be properly setup inside the Xcode project. In order to do that we need to copy the files and update the pbxproj.
 */
const withFishjamSBE: ConfigPlugin<FishjamPluginOptions> = (config, options) =>
  withXcodeProject(config, async (props) => {
    const iosPath = props.modRequest.platformProjectRoot;
    const bundleIdentifier = props.ios?.bundleIdentifier;
    const groupIdentifier = options?.ios?.appGroupContainerId || `group.${bundleIdentifier}`;
    const xcodeProject = props.modResults;
    const targetName = getSbeTargetName(options);

    const pluginDir = require.resolve('@fishjam-cloud/react-native-client/package.json');
    const extensionSourceDir = path.join(pluginDir, '../plugin/broadcastExtensionFiles/');

    const templateTargetName = 'ScreenBroadcastExtension';

    const extFiles = [
      'SampleHandler.swift',
      'SampleUploader.swift',
      `${templateTargetName}.entitlements`,
      `Info.plist`,
      'SocketConnection.swift',
      'DarwinNotificationCenter.swift',
      'Atomic.swift',
    ];

    const destFiles = [
      'SampleHandler.swift',
      'SampleUploader.swift',
      `${targetName}.entitlements`,
      `Info.plist`,
      'SocketConnection.swift',
      'DarwinNotificationCenter.swift',
      'Atomic.swift',
    ];

    // NOTE: `props.modResults` is already a parsed XcodeProject and is persisted by the
    // withXcodeProject mod, so we must NOT call `xcodeProject.parse()` / `writeSync()` here.
    // Doing so re-reads the file asynchronously and races with any other xcodeproj mod
    // (e.g. the livestream extension), orphaning build files ("no parent for object ...").
    if (xcodeProject.pbxTargetByName(targetName)) {
      // eslint-disable-next-line no-console
      console.log(`${targetName} already exists in project. Skipping...`);
      return props;
    }

    try {
      await fs.mkdir(`${iosPath}/${targetName}`, { recursive: true });
      for (let i = 0; i < extFiles.length; i++) {
        const srcFile = `${extensionSourceDir}${extFiles[i]}`;
        const destFile = `${iosPath}/${targetName}/${destFiles[i]}`;
        await fs.copyFile(srcFile, destFile);
      }
    } catch (e) {
      console.error('Error copying extension files: ', e);
      throw e;
    }

    try {
      await updateFileWithRegex(
        iosPath,
        `${targetName}.entitlements`,
        GROUP_IDENTIFIER_TEMPLATE_REGEX,
        groupIdentifier,
        options,
      );
      await updateFileWithRegex(
        iosPath,
        'SampleHandler.swift',
        GROUP_IDENTIFIER_TEMPLATE_REGEX,
        groupIdentifier,
        options,
      );
      await updateFileWithRegex(
        iosPath,
        'SampleUploader.swift',
        BUNDLE_IDENTIFIER_TEMPLATE_REGEX,
        bundleIdentifier || '',
        options,
      );
      await updateFileWithRegex(
        iosPath,
        'Info.plist',
        DISPLAY_NAME_TEMPLATE_REGEX,
        getSbeDisplayName(options),
        options,
      );
    } catch (e) {
      console.error('Error updating extension files: ', e);
    }

    // Create new PBXGroup for the extension
    const extGroup = xcodeProject.addPbxGroup(extFiles, targetName, targetName);

    // Add the new PBXGroup to the top level group. This makes the
    // files / folder appear in the file explorer in Xcode.
    const groups = xcodeProject.hash.project.objects['PBXGroup'];
    Object.keys(groups).forEach(function (key) {
      if (groups[key].name === undefined) {
        xcodeProject.addToPbxGroup(extGroup.uuid, key);
      }
    });

    // WORK AROUND for codeProject.addTarget BUG
    // Xcode projects don't contain these if there is only one target
    // An upstream fix should be made to the code referenced in this link:
    //   - https://github.com/apache/cordova-node-xcode/blob/8b98cabc5978359db88dc9ff2d4c015cba40f150/lib/pbxProject.js#L860
    const projObjects = xcodeProject.hash.project.objects;
    projObjects['PBXTargetDependency'] = projObjects['PBXTargetDependency'] || {};
    projObjects['PBXContainerItemProxy'] = projObjects['PBXContainerItemProxy'] || {};

    // Add the SBE target
    // This adds PBXTargetDependency and PBXContainerItemProxy for you
    const sbeTarget = xcodeProject.addTarget(
      targetName,
      'app_extension',
      targetName,
      `${bundleIdentifier}.${targetName}`,
    );

    // Add build phases to the new target
    xcodeProject.addBuildPhase(
      [
        'SampleHandler.swift',
        'SampleUploader.swift',
        'SocketConnection.swift',
        'DarwinNotificationCenter.swift',
        'Atomic.swift',
      ],
      'PBXSourcesBuildPhase',
      'Sources',
      sbeTarget.uuid,
    );
    xcodeProject.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', sbeTarget.uuid);

    xcodeProject.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', sbeTarget.uuid);

    xcodeProject.addFramework('ReplayKit.framework', {
      target: sbeTarget.uuid,
    });

    // Edit the Deployment info of the new Target, only IphoneOS and Targeted Device Family
    // However, can be more
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      if (
        typeof configurations[key].buildSettings !== 'undefined' &&
        configurations[key].buildSettings.PRODUCT_NAME === `"${targetName}"`
      ) {
        const buildSettingsObj = configurations[key].buildSettings;
        buildSettingsObj.IPHONEOS_DEPLOYMENT_TARGET =
          options?.ios?.iphoneDeploymentTarget ?? IPHONEOS_DEPLOYMENT_TARGET;
        buildSettingsObj.TARGETED_DEVICE_FAMILY = TARGETED_DEVICE_FAMILY;
        buildSettingsObj.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
        buildSettingsObj.CODE_SIGN_STYLE = 'Automatic';
        buildSettingsObj.INFOPLIST_FILE = `${targetName}/Info.plist`;
        buildSettingsObj.SWIFT_VERSION = '5.0';
        buildSettingsObj.MARKETING_VERSION = '1.0.0';
        buildSettingsObj.CURRENT_PROJECT_VERSION = '1';
        buildSettingsObj.ENABLE_BITCODE = 'NO';
      }
    }

    return props;
  });

/**
 * Creates the livestream broadcast extension target.
 * Mirrors withFishjamSBE but copies the in-process WHIP pipeline templates
 * (no socket/JPEG uploader) and registers the LivestreamSampleHandler/WhipClient sources.
 */
const withFishjamLivestreamExtension: ConfigPlugin<FishjamPluginOptions> = (config, options) =>
  withXcodeProject(config, async (props) => {
    const iosPath = props.modRequest.platformProjectRoot;
    const bundleIdentifier = props.ios?.bundleIdentifier;
    const groupIdentifier = options?.ios?.appGroupContainerId || `group.${bundleIdentifier}`;
    const xcodeProject = props.modResults;
    const targetName = getLivestreamTargetName(options);

    const pluginDir = require.resolve('@fishjam-cloud/react-native-client/package.json');
    const extensionSourceDir = path.join(pluginDir, '../plugin/livestreamExtensionFiles/');

    const templateTargetName = 'ScreenLivestreamExtension';

    // NOTE: source file basenames must not collide with the in-call extension's files
    // (e.g. DarwinNotificationCenter.swift), otherwise node-xcode produces build files
    // with no parent group and `pod install` fails with a consistency error.
    const extFiles = [
      'LivestreamSampleHandler.swift',
      'WhipClient.swift',
      `${templateTargetName}.entitlements`,
      `Info.plist`,
      'LivestreamDarwinNotificationCenter.swift',
    ];

    const destFiles = [
      'LivestreamSampleHandler.swift',
      'WhipClient.swift',
      `${targetName}.entitlements`,
      `Info.plist`,
      'LivestreamDarwinNotificationCenter.swift',
    ];

    // See the note in withFishjamSBE: operate on the already-parsed `props.modResults`
    // directly. Calling `xcodeProject.parse()` here would race with the in-call extension
    // mod and orphan build files.
    if (xcodeProject.pbxTargetByName(targetName)) {
      // eslint-disable-next-line no-console
      console.log(`${targetName} already exists in project. Skipping...`);
      return props;
    }

    try {
      await fs.mkdir(`${iosPath}/${targetName}`, { recursive: true });
      for (let i = 0; i < extFiles.length; i++) {
        const srcFile = `${extensionSourceDir}${extFiles[i]}`;
        const destFile = `${iosPath}/${targetName}/${destFiles[i]}`;
        await fs.copyFile(srcFile, destFile);
      }
    } catch (e) {
      console.error('Error copying livestream extension files: ', e);
      throw e;
    }

    try {
      await updateFileWithRegex(
        iosPath,
        `${targetName}.entitlements`,
        GROUP_IDENTIFIER_TEMPLATE_REGEX,
        groupIdentifier,
        options,
        targetName,
      );
      await updateFileWithRegex(
        iosPath,
        'LivestreamSampleHandler.swift',
        GROUP_IDENTIFIER_TEMPLATE_REGEX,
        groupIdentifier,
        options,
        targetName,
      );
      await updateFileWithRegex(
        iosPath,
        'Info.plist',
        GROUP_IDENTIFIER_TEMPLATE_REGEX,
        groupIdentifier,
        options,
        targetName,
      );
      await updateFileWithRegex(
        iosPath,
        'Info.plist',
        DISPLAY_NAME_TEMPLATE_REGEX,
        getLivestreamDisplayName(options),
        options,
        targetName,
      );
    } catch (e) {
      console.error('Error updating livestream extension files: ', e);
    }

    const extGroup = xcodeProject.addPbxGroup(extFiles, targetName, targetName);

    const groups = xcodeProject.hash.project.objects['PBXGroup'];
    Object.keys(groups).forEach(function (key) {
      if (groups[key].name === undefined) {
        xcodeProject.addToPbxGroup(extGroup.uuid, key);
      }
    });

    const projObjects = xcodeProject.hash.project.objects;
    projObjects['PBXTargetDependency'] = projObjects['PBXTargetDependency'] || {};
    projObjects['PBXContainerItemProxy'] = projObjects['PBXContainerItemProxy'] || {};

    const livestreamTarget = xcodeProject.addTarget(
      targetName,
      'app_extension',
      targetName,
      `${bundleIdentifier}.${targetName}`,
    );

    xcodeProject.addBuildPhase(
      ['LivestreamSampleHandler.swift', 'WhipClient.swift', 'LivestreamDarwinNotificationCenter.swift'],
      'PBXSourcesBuildPhase',
      'Sources',
      livestreamTarget.uuid,
    );
    xcodeProject.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', livestreamTarget.uuid);
    xcodeProject.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', livestreamTarget.uuid);

    xcodeProject.addFramework('ReplayKit.framework', {
      target: livestreamTarget.uuid,
    });

    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      if (
        typeof configurations[key].buildSettings !== 'undefined' &&
        configurations[key].buildSettings.PRODUCT_NAME === `"${targetName}"`
      ) {
        const buildSettingsObj = configurations[key].buildSettings;
        buildSettingsObj.IPHONEOS_DEPLOYMENT_TARGET =
          options?.ios?.iphoneDeploymentTarget ?? IPHONEOS_DEPLOYMENT_TARGET;
        buildSettingsObj.TARGETED_DEVICE_FAMILY = TARGETED_DEVICE_FAMILY;
        buildSettingsObj.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
        buildSettingsObj.CODE_SIGN_STYLE = 'Automatic';
        buildSettingsObj.INFOPLIST_FILE = `${targetName}/Info.plist`;
        buildSettingsObj.SWIFT_VERSION = '5.0';
        buildSettingsObj.MARKETING_VERSION = '1.0.0';
        buildSettingsObj.CURRENT_PROJECT_VERSION = '1';
        buildSettingsObj.ENABLE_BITCODE = 'NO';
      }
    }

    return props;
  });

/**
 * Links FishjamWebRTC into the livestream extension target by injecting a target block
 * into the generated Podfile. The base config plugin adds no pods to extensions; the
 * livestream extension needs FishjamWebRTC because it runs the WebRTC pipeline in-process.
 */
const withFishjamLivestreamPodfile: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const targetName = getLivestreamTargetName(props);
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const podfile = await fs.readFile(podfilePath, { encoding: 'utf-8' });

      const marker = `target '${targetName}'`;
      if (!podfile.includes(marker)) {
        const block = `\n${marker} do\n  pod 'FishjamWebRTC', '${FISHJAM_WEBRTC_POD_VERSION}'\nend\n`;
        await fs.writeFile(podfilePath, `${podfile}\n${block}`);
      }

      return cfg;
    },
  ]);

/**
 * Adds iOS VoIP background mode to keep the app running during calls
 */
const withFishjamVoIPBackgroundMode: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withInfoPlist(config, (configuration) => {
    if (props?.ios?.enableVoIPBackgroundMode) {
      const backgroundModes = new Set(configuration.modResults.UIBackgroundModes ?? []);
      backgroundModes.add('voip');

      configuration.modResults.UIBackgroundModes = Array.from(backgroundModes);
    }

    return configuration;
  });

const withFishjamPictureInPicture: ConfigPlugin<FishjamPluginOptions> = (config, props) =>
  withInfoPlist(config, (configuration) => {
    if (props?.ios?.supportsPictureInPicture) {
      const backgroundModes = new Set(configuration.modResults.UIBackgroundModes ?? []);
      backgroundModes.add('audio');
      configuration.modResults.UIBackgroundModes = Array.from(backgroundModes);
    }

    return configuration;
  });

const withFishjamIos: ConfigPlugin<FishjamPluginOptions> = (config, props) => {
  if (props?.ios?.enableScreensharing) {
    config = withAppGroupPermissions(config, props);
    config = withInfoPlistConstants(config, props);
    config = withFishjamSBE(config, props);
  }
  if (props?.ios?.enableLivestreamScreensharing) {
    config = withAppGroupPermissions(config, props);
    config = withLivestreamInfoPlistConstants(config, props);
    config = withFishjamLivestreamExtension(config, props);
    config = withFishjamLivestreamPodfile(config, props);
  }
  config = withPodfileProperties(config, (configuration) => {
    configuration.modResults['ios.deploymentTarget'] = props?.ios?.iphoneDeploymentTarget ?? IPHONEOS_DEPLOYMENT_TARGET;
    return configuration;
  });
  config = withFishjamPictureInPicture(config, props);
  config = withFishjamVoIPBackgroundMode(config, props);
  return config;
};

export { withFishjamIos };
