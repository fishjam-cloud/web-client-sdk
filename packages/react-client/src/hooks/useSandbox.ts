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

export type UseSandboxProps = {
  // overrides the default URL derived from the `fishjamId` prop of `FishjamProvider`
  configOverride?: { fishjamUrl?: string };
};

export type RoomType = "conference" | "livestream" | "audio_only";

export const useSandbox = (props?: UseSandboxProps) => {
  const fishjamId = useContext(FishjamIdContext);

  if (!fishjamId && !props?.configOverride) {
    throw Error(`You haven't passed the fishjamId to the FishjamProvider.`);
  }

  const overridenFishjamUrl = props?.configOverride?.fishjamUrl;
  const fishjamUrl = `${FISHJAM_HTTP_CONNECT_URL}/${fishjamId}`;

  const roomManagerUrl = `${overridenFishjamUrl ?? fishjamUrl}/room-manager`;

  const getSandboxPeerToken = async (roomName: string, peerName: string, roomType: RoomType = "conference") => {
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
    const url = new URL(`${roomManagerUrl}/${roomName}/livestream-viewer-token`);

    const res = await fetch(url);
    if (!res.ok) {
      let message = `Failed to retrieve viewer token for '${roomName}' livestream room.`;
      if (res.status === 404) {
        message = `A livestreaam room of name '${roomName}' does not exist.`;
      }
      throw new Error(message);
    }
    const data: { token: string } = await res.json();

    return data.token;
  };

  return { getSandboxPeerToken, getSandboxViewerToken };
};
