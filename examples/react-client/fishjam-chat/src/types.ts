import { type RoomType } from "@fishjam-cloud/react-client";

export type RoomForm = {
  roomManagerUrl: string;
  roomName: string;
  peerName: string;
  roomType: RoomType;
};
