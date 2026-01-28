import { useForegroundService as externalUseForegroundService } from '@fishjam-cloud/react-native-webrtc';

/**
 * Configuration options for foreground service permissions.
 *
 * A type representing the configuration for foreground service permissions.
 */
export type ForegroundServiceConfig = {
  /**
   * Indicates whether the camera is enabled for the foreground service.
   */
  enableCamera?: boolean;
  /**
   * Indicates whether the microphone is enabled for the foreground service.
   */
  enableMicrophone?: boolean;
  /**
   * Indicates whether screen sharing is enabled for the foreground service.
   */
  enableScreenSharing?: boolean;
  /**
   * The id of the channel. Must be unique per package.
   */
  channelId?: string;
  /**
   * The user visible name of the channel.
   */
  channelName?: string;
  /**
   * The title (first row) of the notification, in a standard notification.
   */
  notificationTitle?: string;
  /**
   * The text (second row) of the notification, in a standard notification.
   */
  notificationContent?: string;
};

/**
 * Hook for managing a foreground service on Android.
 *
 * A hook for managing a foreground service on Android. Does nothing on other platforms.
 * You can use this hook to keep your app running in the background. You're also required to run a foreground service when screen sharing.
 *
 * @param config - Configuration options for the foreground service.
 */
export const useForegroundService = externalUseForegroundService;
