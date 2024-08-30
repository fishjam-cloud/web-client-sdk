import { useEffect } from "react";
import { DevicePicker } from "./components/DevicePicker";
import { RoomConnector } from "./components/RoomConnector";
import { VideoTracks } from "./components/VideoTracks";
import { AudioTracks } from "./components/AudioTracks";
import { useClient, useParticipants } from "@fishjam-cloud/react-client";

function App() {
  const client = useClient();
  const { localParticipant, participants } = useParticipants();

  useEffect(() => {
    client.initializeDevices();
  }, [client]);

  return (
    <main className="flex h-screen w-screen">
      <section className="h-full w-1/3 space-y-8 bg-zinc-200 p-4">
        <h1 className="text-xl">Videoroom example</h1>

        <RoomConnector />

        <DevicePicker />
      </section>

      <div className="h-full w-full p-4">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
