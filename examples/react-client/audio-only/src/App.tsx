import { useCallback, useState } from "react";
import { useConnection } from "@fishjam-cloud/react-client";
import axios from "axios";

interface RoomManagerResponse {
  peerToken: string;
  url: string;
}

function App() {
  const { joinRoom } = useConnection();

  const onJoinRoomPress = useCallback(async () => {
    const response = await axios.get<RoomManagerResponse>(
      import.meta.env.VITE_ROOM_MANAGER_URL,
      { params: { roomName: "x", peerName: "y" } },
    );
    await joinRoom({
      url: response.data.url,
      peerToken: response.data.peerToken,
    });
  }, [joinRoom]);

  return (
    <>
      <h1>Audio only chat</h1>

      <div className="card">
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
