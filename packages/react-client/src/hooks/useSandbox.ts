import {
  getSandboxLivestream,
  getSandboxMoqPublisherAccess,
  getSandboxMoqSubscriberAccess,
  getSandboxPeerToken,
  getSandboxViewerToken,
  type MoqAccess,
  type RoomType,
  type SandboxOptions,
} from "@fishjam-cloud/tsunami";
import { useCallback } from "react";

export type { MoqAccess, RoomType, SandboxOptions };

export type UseSandboxProps = {
  sandboxApiUrl: string;
};

export const useSandbox = (props: UseSandboxProps) => {
  const sandboxApiUrl = props?.sandboxApiUrl;

  return {
    getSandboxPeerToken: useCallback(
      (roomName: string, peerName: string, roomType: RoomType = "conference", options: SandboxOptions = {}) =>
        getSandboxPeerToken(sandboxApiUrl, roomName, peerName, roomType, options),
      [sandboxApiUrl],
    ),
    getSandboxViewerToken: useCallback(
      (roomName: string) => getSandboxViewerToken(sandboxApiUrl, roomName),
      [sandboxApiUrl],
    ),
    getSandboxLivestream: useCallback(
      (roomName: string, isPublic: boolean = false, options: SandboxOptions = {}) =>
        getSandboxLivestream(sandboxApiUrl, roomName, isPublic, options),
      [sandboxApiUrl],
    ),
    getSandboxMoqPublisherAccess: useCallback(
      (streamName: string) => getSandboxMoqPublisherAccess(sandboxApiUrl, streamName),
      [sandboxApiUrl],
    ),
    getSandboxMoqSubscriberAccess: useCallback(
      (streamName: string) => getSandboxMoqSubscriberAccess(sandboxApiUrl, streamName),
      [sandboxApiUrl],
    ),
  };
};
