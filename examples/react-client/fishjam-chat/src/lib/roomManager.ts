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
  const res = await axios.get<RoomManagerResponse>(roomManagerUrl, {
    params: { peerName, roomName },
  });

  return res.data;
};
