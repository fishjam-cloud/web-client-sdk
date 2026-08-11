import {
  getSandboxLivestream,
  getSandboxMoqPublisherAccess,
  getSandboxMoqSubscriberAccess,
  getSandboxPeerToken,
  getSandboxViewerToken,
  type MoqAccess,
  type RoomType,
} from "@fishjam-cloud/tsunami";
import { useCallback } from "react";

export type { MoqAccess, RoomType };

export type UseSandboxProps = {
  sandboxApiUrl: string;
};

export const useSandbox = (props: UseSandboxProps) => {
  const sandboxApiUrl = props?.sandboxApiUrl;

  return {
    getSandboxPeerToken: useCallback(
      (roomName: string, peerName: string, roomType: RoomType = "conference") =>
        getSandboxPeerToken(sandboxApiUrl, roomName, peerName, roomType),
      [sandboxApiUrl],
    ),
    getSandboxViewerToken: useCallback(
      (roomName: string) => getSandboxViewerToken(sandboxApiUrl, roomName),
      [sandboxApiUrl],
    ),
    getSandboxLivestream: useCallback(
      (roomName: string, isPublic: boolean = false) => getSandboxLivestream(sandboxApiUrl, roomName, isPublic),
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
