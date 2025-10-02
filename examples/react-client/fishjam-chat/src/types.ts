import { type RoomType } from "@fishjam-cloud/react-client";

export type RoomForm = {
  roomName: string;
  peerName: string;
  roomType: RoomType;
  fishjamId: string;
};
