import { DevicePicker } from "./components/DevicePicker";
import { RoomConnector } from "./components/RoomConnector";
import { VideoTracks } from "./components/VideoTracks";
import { AudioTracks } from "./components/AudioTracks";
import {
  useInitializeDevices,
  useParticipants,
} from "@fishjam-cloud/react-client";
import { useEffect } from "react";

function App() {
  const { localParticipant, participants } = useParticipants();

  const { initializeDevices } = useInitializeDevices();

  useEffect(() => {
    initializeDevices();
  }, [initializeDevices]);

  return (
    <main className="flex h-screen w-screen">
      <section className="h-full w-1/3 space-y-8 overflow-auto bg-zinc-200 p-4">
        <h1 className="text-xl">FishjamChat</h1>

        <RoomConnector />

        <DevicePicker />
      </section>

      <div className="h-full w-full p-4">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {localParticipant && (
            <VideoTracks
              videoTracks={[
                ...localParticipant.cameraTracks,
                ...localParticipant.screenshareVideoTracks,
              ]}
              name="You"
              id="0"
            />
          )}

          {participants.map(
            ({ id, cameraTracks, screenshareVideoTracks, metadata }) => (
              <VideoTracks
                key={id}
                videoTracks={[...cameraTracks, ...screenshareVideoTracks]}
                name={metadata?.displayName ?? id}
                id={id}
              />
            ),
          )}

          {participants.map(
            ({ id, microphoneTracks, screenshareAudioTracks }) => (
              <AudioTracks
                audioTracks={[...microphoneTracks, ...screenshareAudioTracks]}
                key={id}
              />
            ),
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
