import { useConnection } from "@fishjam-cloud/react-client";
import axios from "axios";
import { FC, useCallback } from "react";

type RoomManagerResponse = {
  peerToken: string;
  url: string;
};

export type RoomManagerParams = {
  roomName: string;
  peerName: string;
};

type JoinRoomFormProps = {
  onJoinedRoom: (params: RoomManagerParams) => void;
};

export const JoinRoomForm: FC<JoinRoomFormProps> = ({ onJoinedRoom }) => {
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
      onJoinedRoom(params);
    },
    [joinRoom, onJoinedRoom],
  );

  return (
    <form
      style={{ display: "flex", gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        onJoinRoom({
          roomName: formData.get("roomName") as string,
          peerName: formData.get("peerName") as string,
        });
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <label>Room name</label>

        <input required name="roomName" placeholder="Room name" />
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <label>Username</label>

        <input required name="peerName" placeholder="Username" />
      </div>

      <button type="submit">Join room</button>
    </form>
  );
};
