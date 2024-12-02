import axios from "axios";

type BasicInfo = { id: string; name: string };
type RoomManagerResponse = {
  peerToken: string;
  url: string;
  room: BasicInfo;
  peer: BasicInfo;
};

export const getRoomCredentials = async (
  roomManagerUrl: string,
  roomName: string,
  peerName: string,
) => {
  // remove duplicate get params (in case user will just copy params from UI)
  const url = new URL(roomManagerUrl)!;
  url.searchParams.set("roomName", roomName);
  url.searchParams.set("peerName", peerName);

  const res = await axios.get<RoomManagerResponse>(url.toString());

  return res.data;
};
