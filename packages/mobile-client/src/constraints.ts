/**
 * Google-specific audio processing constraints (legacy Chrome constraints).
 * These are not part of the standard MediaTrackConstraints type but are supported by WebRTC implementations.
 */
interface GoogleAudioConstraints {
  googEchoCancellation?: string | boolean;
  googAutoGainControl?: string | boolean;
  googNoiseSuppression?: string | boolean;
  googTypingNoiseDetection?: string | boolean;
  googHighpassFilter?: string | boolean;
}

/**
 * Extended MediaTrackConstraints that includes Google-specific audio processing properties.
 */
export type ExtendedMediaTrackConstraints = MediaTrackConstraints & GoogleAudioConstraints;

/**
 * Default audio constraints for mobile-client with Google audio processing features enabled.
 * These constraints can be overridden by passing custom audio constraints to FishjamProvider.
 */
export const DEFAULT_MOBILE_AUDIO_CONSTRAINTS: ExtendedMediaTrackConstraints = {
  googEchoCancellation: 'true',
  googAutoGainControl: 'true',
  googNoiseSuppression: 'true',
  googTypingNoiseDetection: 'true',
  googHighpassFilter: 'true',
};

/**
 * Merges default mobile audio constraints with user-provided constraints.
 * User-provided constraints take precedence over defaults.
 *
 * @param userConstraints - User-provided audio constraints (can be boolean or MediaTrackConstraints)
 * @returns Merged audio constraints
 */
export function mergeMobileAudioConstraints(
  userConstraints?: ExtendedMediaTrackConstraints | boolean,
): ExtendedMediaTrackConstraints | boolean {
  if (userConstraints === false) {
    return false;
  }

  if (userConstraints === true || userConstraints === undefined) {
    return DEFAULT_MOBILE_AUDIO_CONSTRAINTS;
  }

  return {
    ...DEFAULT_MOBILE_AUDIO_CONSTRAINTS,
    ...userConstraints,
  };
}
