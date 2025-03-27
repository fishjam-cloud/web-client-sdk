import { usePeers, useVAD } from "@fishjam-cloud/react-client";
import { AudioPlayer } from "./AudioPlayer";

export const PeerList = () => {
  const { remotePeers } = usePeers();
  const peersSpeaking = useVAD({ peerIds: remotePeers.map((p) => p.id) });

  if (!remotePeers.length) {
    return <p>You're alone in the room.</p>;
  }

  return (
    <ul>
      {remotePeers.map((peer) => (
        <div key={peer.id}>
          <p>
            {`${peer.metadata?.server?.username}`}{" "}
            {peersSpeaking[peer.id] && (
              <span style={{ color: "red" }}>Speaking now</span>
            )}
          </p>

          <AudioPlayer track={peer.microphoneTrack?.track} />
        </div>
      ))}
    </ul>
  );
};
