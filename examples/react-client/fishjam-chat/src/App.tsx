import { DevicePicker } from "./components/DevicePicker";
import { RoomConnector } from "./components/RoomConnector";
import { Tile } from "./components/Tile.tsx";
import {
  useInitializeDevices,
  useParticipants,
} from "@fishjam-cloud/react-client";
import { Fragment, useEffect } from "react";
import AudioPlayer from "./components/AudioPlayer.tsx";

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
            <>
              <Tile
                id="You"
                name="You"
                videoTrack={localParticipant.cameraTrack}
                audioTrack={localParticipant.microphoneTrack}
              />
              {localParticipant.screenShareVideoTrack && (
                <Tile
                  id="Your screen share"
                  name="Your screen share"
                  videoTrack={localParticipant.screenShareVideoTrack}
                  audioTrack={localParticipant.screenShareAudioTrack}
                />
              )}
            </>
          )}

          {participants.map(
            ({
              id,
              cameraTrack,
              microphoneTrack,
              screenShareVideoTrack,
              screenShareAudioTrack,
              metadata,
            }) => {
              const label = metadata?.displayName ?? id;

              return (
                <Fragment key={id}>
                  <Tile
                    id={id}
                    name={label}
                    videoTrack={cameraTrack}
                    audioTrack={microphoneTrack}
                  />

                  {screenShareVideoTrack && (
                    <Tile
                      id={id}
                      name={`Screen share: ${label}`}
                      videoTrack={screenShareVideoTrack}
                      audioTrack={screenShareAudioTrack}
                    />
                  )}
                </Fragment>
              );
            },
          )}

          {participants.map(
            ({ id, microphoneTrack, screenShareAudioTrack }) => (
              <Fragment key={id}>
                {microphoneTrack?.stream && (
                  <AudioPlayer stream={microphoneTrack.stream} />
                )}
                {screenShareAudioTrack?.stream && (
                  <AudioPlayer stream={screenShareAudioTrack.stream} />
                )}
              </Fragment>
            ),
          )}
        </section>
      </div>
    </main>
  );
}

export default App;
