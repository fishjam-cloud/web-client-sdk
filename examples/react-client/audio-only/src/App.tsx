import {
  useConnection,
  useInitializeDevices,
} from "@fishjam-cloud/react-client";
import { useEffect } from "react";
import { RoomInfo } from "./RoomInfo";
import { PeerList } from "./PeerList";
import { MicrophoneSettings } from "./MicrophoneSettings";

function App() {
  const { initializeDevices } = useInitializeDevices();
  const { peerStatus } = useConnection();

  useEffect(() => {
    initializeDevices({ enableVideo: false });
  }, [initializeDevices]);

  return (
    <>
      <h1>Audio only chat</h1>

      <MicrophoneSettings />

      <RoomInfo />

      {peerStatus === "connected" && <PeerList />}
    </>
  );
}

export default App;
