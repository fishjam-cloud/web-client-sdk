import { useConnection } from "@fishjam-cloud/react-client";
import { JoinRoomForm } from "./JoinRoomForm";
import { useState } from "react";

export const RoomInfo = () => {
  const [roomName, setRoomName] = useState<string | null>(null);
  const { leaveRoom, peerStatus } = useConnection();

  const onDisconnect = () => {
    setRoomName(null);
    leaveRoom();
  };

  if (peerStatus === "error") {
    return <p>Failed to join the room</p>;
  }

  if (peerStatus === "connecting") {
    return <p>Connecting</p>;
  }

  if (peerStatus === "idle") {
    return (
      <JoinRoomForm
        onJoinedRoom={(p) => {
          setRoomName(p.roomName);
        }}
      />
    );
  }
  return (
    <div>
      Connected to {roomName} <button onClick={onDisconnect}>Disconnect</button>
    </div>
  );
};
