import { useContext } from "react";

import { ConnectUrlContext } from "../contexts/connect_url";

type BasicInfo = { id: string; name: string };
type RoomManagerResponse = {
  peerToken: string;
  url: string;
  room: BasicInfo;
  peer: BasicInfo;
};

export const useSandbox = () => {
  const fishjamId = useContext(ConnectUrlContext);
  if (!fishjamId) throw Error("useSandbox must be used within FishjamProvider");

  const roomManagerUrl = `https://cloud-two.fishjam.ovh/api/v1/connect/${fishjamId}/room-manager`;

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
