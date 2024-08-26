import { useEffect } from "react";
import { useClient, useParticipants } from "./client";
import { DevicePicker } from "./components/DevicePicker";
import { RoomConnector } from "./components/RoomConnector";
import { VideoTracks } from "./components/VideoTracks";
import { AudioTracks } from "./components/AudioTracks";

function App() {
  const client = useClient();
  const { localParticipant, participants } = useParticipants();

  useEffect(() => {
    client.initializeDevices({
      videoTrackConstraints: true,
      audioTrackConstraints: true,
    });
  }, [client]);
  return (
    <main className="w-screen h-screen flex">
      <section className="w-1/3 bg-zinc-200 p-4 h-full space-y-8">
        <h1 className="text-xl">Videoroom example</h1>

        <RoomConnector />

        <DevicePicker />
      </section>

      <div className="w-full h-full p-4">
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {localParticipant && (
            <VideoTracks
              videoTracks={localParticipant.videoTracks}
              name="You"
              id="0"
            />
          )}

          {participants.map(({ id, videoTracks, metadata }) => (
            <VideoTracks
              videoTracks={videoTracks}
              name={(metadata as { name?: string })?.name ?? id}
              id={id}
            />
          ))}
          {participants.map(({ id, audioTracks }) => (
            <AudioTracks audioTracks={audioTracks} key={id} />
          ))}
        </section>
      </div>
    </main>
  );
}

export default App;
