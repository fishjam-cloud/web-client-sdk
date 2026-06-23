import { useCallback } from "react";

import { MissingSandboxApiUrlError } from "../utils/errors";

type BasicInfo = { id: string; name: string };
type RoomManagerResponse = {
  peerToken: string;
  url: string;
  room: BasicInfo;
  peer: BasicInfo;
};

type MoqAccessResponse = {
  connection_url: string;
  token: string;
};

export type MoqAccess = {
  connectionUrl: string;
  token: string;
};

export type UseSandboxProps = {
  sandboxApiUrl: string;
};

export type RoomType = "conference" | "livestream" | "audio_only";

export const useSandbox = (props: UseSandboxProps) => {
  const sandboxApiUrl = props?.sandboxApiUrl;

  const getSandboxPeerToken = useCallback(
    async (roomName: string, peerName: string, roomType: RoomType = "conference") => {
      if (!sandboxApiUrl) throw new MissingSandboxApiUrlError();

      const url = new URL(sandboxApiUrl);
      url.searchParams.set("roomName", roomName);
      url.searchParams.set("peerName", peerName);
      url.searchParams.set("roomType", roomType);

      const res = await fetch(url);

      if (!res.ok) {
        const message = `Failed to retrieve peer token for peer '${peerName}' in ${roomType} room '${roomName}'.`;
        throw new Error(message);
      }

      const data: RoomManagerResponse = await res.json();
      return data.peerToken;
    },
    [sandboxApiUrl],
  );

  const getSandboxViewerToken = useCallback(
    async (roomName: string) => {
      if (!sandboxApiUrl) throw new MissingSandboxApiUrlError();

      const url = new URL(`${sandboxApiUrl}/${roomName}/livestream-viewer-token`);

      const res = await fetch(url);
      if (!res.ok) {
        let message = `Failed to retrieve viewer token for '${roomName}' livestream room.`;
        if (res.status === 404) {
          message = `A livestream room of name '${roomName}' does not exist.`;
        }
        throw new Error(message);
      }
      const data: { token: string } = await res.json();

      return data.token;
    },
    [sandboxApiUrl],
  );

  const getSandboxLivestream = useCallback(
    async (roomName: string, isPublic: boolean = false) => {
      if (!sandboxApiUrl) throw new MissingSandboxApiUrlError();

      const url = new URL(`${sandboxApiUrl}/livestream`);
      url.searchParams.set("roomName", roomName);
      url.searchParams.set("public", isPublic.toString());

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to retrieve streamer token for '${roomName}' livestream room.`);

      const data: { streamerToken: string; room: { id: string; name: string } } = await res.json();
      return data;
    },
    [sandboxApiUrl],
  );

  const fetchMoqAccess = useCallback(
    async (streamName: string, type: "subscriber" | "publisher"): Promise<MoqAccess> => {
      if (!sandboxApiUrl) throw new MissingSandboxApiUrlError();

      const urlEncodedStreamName = encodeURIComponent(streamName);

      const res = await fetch(`${sandboxApiUrl}/moq/${urlEncodedStreamName}/${type}`);
      if (!res.ok) throw new Error(`Failed to retrieve MoQ ${type} connection for stream '${streamName}'.`);

      const data: MoqAccessResponse = await res.json();
      return { connectionUrl: data.connection_url, token: data.token };
    },
    [sandboxApiUrl],
  );

  const getSandboxMoqPublisherAccess = useCallback(
    async (streamName: string) => fetchMoqAccess(streamName, "publisher"),
    [fetchMoqAccess],
  );

  const getSandboxMoqSubscriberAccess = useCallback(
    async (streamName: string) => fetchMoqAccess(streamName, "subscriber"),
    [fetchMoqAccess],
  );

  return {
    getSandboxPeerToken,
    getSandboxViewerToken,
    getSandboxLivestream,
    getSandboxMoqPublisherAccess,
    getSandboxMoqSubscriberAccess,
  };
};
