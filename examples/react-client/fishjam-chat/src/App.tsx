import { useConnection } from "@fishjam-cloud/react-client";

import { JoinRoomCard } from "./components/JoinRoomCard";
import { RoomView } from "./components/RoomView";

function App() {
  const { peerStatus } = useConnection();
  const isConnected = peerStatus === "connected";

  return (
    <main className="flex h-screen w-screen bg-stone-100">
      {isConnected ? (
        <RoomView />
      ) : (
        <JoinRoomCard className="m-auto w-full max-w-md" />
      )}
    </main>
  );
}

export default App;
