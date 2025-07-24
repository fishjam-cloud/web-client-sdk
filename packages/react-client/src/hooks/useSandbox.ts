import { useContext } from "react";

import { FISHJAM_HTTP_CONNECT_URL } from "../consts";
import { FishjamIdContext } from "../contexts/fishjamId";

type BasicInfo = { id: string; name: string };
type RoomManagerResponse = {
  peerToken: string;
  url: string;
  room: BasicInfo;
  peer: BasicInfo;
};

class FishjamIdMisconfiguredError extends Error {
  constructor() {
    super("You haven't passed the fishjamId to the FishjamProvider.");
  }
}

export type UseSandboxProps = {
  /**
   * Allows to override the default url derived from the Fishjam ID and the ID itself
   */
  configOverride?: { fishjamId?: string; fishjamUrl?: string };
};

export type RoomType = "conference" | "livestream" | "audio_only";

export const useSandbox = (props?: UseSandboxProps) => {
  const fishjamId = useContext(FishjamIdContext) ?? props?.configOverride?.fishjamId;

  const overridenFishjamUrl = props?.configOverride?.fishjamUrl;
  const fishjamUrl = `${FISHJAM_HTTP_CONNECT_URL}/${fishjamId}`;

  const isFishjamIdMisconfigured = !fishjamId && !props?.configOverride?.fishjamUrl;

  const roomManagerUrl = `${overridenFishjamUrl ?? fishjamUrl}/room-manager`;

  const getSandboxPeerToken = async (roomName: string, peerName: string, roomType: RoomType = "conference") => {
    if (isFishjamIdMisconfigured) throw new FishjamIdMisconfiguredError();

    const url = new URL(roomManagerUrl);
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
  };

  const getSandboxViewerToken = async (roomName: string) => {
    if (isFishjamIdMisconfigured) throw new FishjamIdMisconfiguredError();

    const url = new URL(`${roomManagerUrl}/${roomName}/livestream-viewer-token`);

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
  };

  const getSandboxLivestream = async (roomName: string, isPublic: boolean = false) => {
    if (isFishjamIdMisconfigured) throw new FishjamIdMisconfiguredError();

    const url = new URL(`${roomManagerUrl}/livestream`);
    url.searchParams.set("roomName", roomName);
    url.searchParams.set("public", isPublic.toString());

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to retrieve streamer token for '${roomName}' livestream room.`);

    const data: { streamerToken: string; room: { id: string; name: string } } = await res.json();
    return data;
  };

  return { getSandboxPeerToken, getSandboxViewerToken, getSandboxLivestream };
};
