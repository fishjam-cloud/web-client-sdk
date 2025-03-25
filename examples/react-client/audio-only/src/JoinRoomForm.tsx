import { useConnection } from "@fishjam-cloud/react-client";
import axios from "axios";
import { FC, useCallback } from "react";

type RoomManagerResponse = {
  peerToken: string;
  url: string;
};

type RoomManagerParams = {
  roomName: string;
  peerName: string;
};

type JoinRoomFormProps = {
  onJoinedRoom: (params: RoomManagerParams) => void;
};

export const JoinRoomForm: FC<JoinRoomFormProps> = (props) => {
  const { joinRoom } = useConnection();

  const onJoinRoom = useCallback(
    async (params: RoomManagerParams) => {
      const response = await axios.get<RoomManagerResponse>(
        import.meta.env.VITE_ROOM_MANAGER_URL,
        { params },
      );
      await joinRoom({
        url: response.data.url,
        peerToken: response.data.peerToken,
      });
      props.onJoinedRoom(params);
    },
    [joinRoom],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        onJoinRoom({
          roomName: formData.get("roomName") as string,
          peerName: formData.get("peerName") as string,
        });
      }}
    >
      <input name="roomName" placeholder="Room name" />
      <input name="peerName" placeholder="Your name" />
      <button type="submit">Join room</button>
    </form>
  );
};
