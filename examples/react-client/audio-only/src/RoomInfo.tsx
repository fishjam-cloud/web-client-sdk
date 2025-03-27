import { useConnection } from "@fishjam-cloud/react-client";
import { JoinRoomForm, type RoomManagerParams } from "./JoinRoomForm";
import { useState } from "react";

export const RoomInfo = () => {
  const [currentParams, setCurrentParams] = useState<RoomManagerParams | null>(
    null,
  );
  const { leaveRoom, peerStatus } = useConnection();

  const onDisconnect = () => {
    setCurrentParams(null);
    leaveRoom();
  };

  if (peerStatus === "error") {
    return <p>Failed to join the room</p>;
  }

  if (peerStatus === "connecting") {
    return <p>Connecting</p>;
  }

  if (peerStatus === "idle") {
    return <JoinRoomForm onJoinedRoom={setCurrentParams} />;
  }

  return (
    <div>
      Connected to "{currentParams?.roomName}" as "{currentParams?.peerName}".
      <button style={{ marginLeft: 12 }} onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
};
