import { useContext } from "react";

import { FISHJAM_HTTP_CONNECT_URL } from "../consts";
import { ConnectUrlContext } from "../contexts/connect_url";

type BasicInfo = { id: string; name: string };
type RoomManagerResponse = {
  peerToken: string;
  url: string;
  room: BasicInfo;
  peer: BasicInfo;
};

export type UseSandboxProps = {
  // overrides the default URL derived from the `fishjamId` prop of `FishjamProvider`
  roomManagerUrl?: string;
};

export const useSandbox = (props?: UseSandboxProps) => {
  const fishjamId = useContext(ConnectUrlContext);
  if (!fishjamId && props?.roomManagerUrl) {
    throw Error(
      `You haven't passed the fishjamId to the FishjamProvider, nor have you passed the roomManagerUrl prop in the useSandbox hook.`,
    );
  }

  const roomManagerUrl = props?.roomManagerUrl ?? `${FISHJAM_HTTP_CONNECT_URL}/${fishjamId}/room-manager`;

  const getSandboxPeerToken = async (roomName: string, peerName: string, roomType = "conference") => {
    const url = new URL(roomManagerUrl);
    url.searchParams.set("roomName", roomName);
    url.searchParams.set("peerName", peerName);
    url.searchParams.set("roomType", roomType);

    const res = await fetch(url);
    const data: RoomManagerResponse = await res.json();

    return data.peerToken;
  };

  const getSandboxViewerToken = async (roomName: string) => {
    const url = new URL(`${roomManagerUrl}/${roomName}/livestream-viewer-token`);

    const res = await fetch(url);
    const data: { token: string } = await res.json();

    return data.token;
  };

  return { getSandboxPeerToken, getSandboxViewerToken };
};
