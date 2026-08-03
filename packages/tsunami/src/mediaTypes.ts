import type { Variant } from "@fishjam-cloud/ts-client";

import type { DeviceError } from "./devices/errors";
import type { PlatformMediaStream, PlatformMediaStreamTrack } from "./devices/deviceManager";

export type MiddlewareResult = { track: PlatformMediaStreamTrack; onClear?: () => void };

/**
 * Transforms a single local track (e.g. background blur) before it is
 * published. Passing `null` removes the current middleware.
 */
export type TrackMiddleware =
  | ((track: PlatformMediaStreamTrack) => MiddlewareResult | Promise<MiddlewareResult>)
  | null;

export type TracksMiddlewareResult = {
  videoTrack: PlatformMediaStreamTrack;
  audioTrack: PlatformMediaStreamTrack | null;
  onClear: () => void;
};

/**
 * Transforms a screen-share track pair before it is published.
 */
export type TracksMiddleware = (
  videoTrack: PlatformMediaStreamTrack,
  audioTrack: PlatformMediaStreamTrack | null,
) => TracksMiddlewareResult | Promise<TracksMiddlewareResult>;

export type SimulcastBandwidthLimits = {
  [Variant.VARIANT_LOW]: number;
  [Variant.VARIANT_MEDIUM]: number;
  [Variant.VARIANT_HIGH]: number;
};

export type BandwidthLimits = { singleStream: number; simulcast: SimulcastBandwidthLimits };

export type StreamConfig = { sentQualities?: Variant[] | false };

export type InitializeDevicesStatus = "initialized" | "failed" | "initialized_with_errors" | "already_initialized";

export type InitializeDevicesResult = {
  status: InitializeDevicesStatus;
  stream: PlatformMediaStream | null;
  errors: { audio: DeviceError | null; video: DeviceError | null } | null;
};

export type InitializeDevicesSettings = { enableVideo?: boolean; enableAudio?: boolean };
