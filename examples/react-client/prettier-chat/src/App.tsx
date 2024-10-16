import { JoinRoomCard } from "./components/JoinRoomCard";
import { RoomView } from "./components/RoomView";
import { useStatus } from "@fishjam-cloud/react-client";

function App() {
  const peerStatus = useStatus();
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
