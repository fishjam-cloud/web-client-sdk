import { usePeers } from "@fishjam-cloud/react-client";
import { Fragment } from "react";

import { nonNullablePredicate } from "@/lib/utils";

import { CallToolbar } from "./CallToolbar";
import { Tile } from "./Tile";

export const RoomView = () => {
  const { localPeer, remotePeers } = usePeers<{ displayName: string }>();

  const trackAmount = [localPeer, ...remotePeers]
    .filter(nonNullablePredicate)
    .reduce((acc, curr) => {
      if (curr.cameraTrack) acc++;
      if (curr.screenShareVideoTrack) acc++;
      return acc;
    }, 0);

  const tilesSqrt = trackAmount === 2 ? 2 : Math.ceil(Math.sqrt(trackAmount));

  return (
    <div className="flex w-full flex-col justify-between">
      <section className="flex-1 overflow-y-auto">
        <div
          className="grid h-full w-full grid-flow-row gap-4 p-4"
          style={{
            gridTemplateRows: `repeat(${tilesSqrt}, minmax(0, 1fr))`,
            gridTemplateColumns: `repeat(${tilesSqrt}, minmax(0, 1fr))`,
          }}
        >
          {localPeer && (
            <>
              <Tile
                id={localPeer.id}
                name="You"
                videoTrack={localPeer.cameraTrack}
              />
              {localPeer.screenShareVideoTrack && (
                <Tile
                  id="Your screen share"
                  name="Your screen share"
                  videoTrack={localPeer.screenShareVideoTrack}
                  audioTrack={localPeer.screenShareAudioTrack}
                />
              )}
            </>
          )}

          {remotePeers.map(
            ({
              id,
              cameraTrack,
              microphoneTrack,
              screenShareVideoTrack,
              screenShareAudioTrack,
              metadata,
            }) => {
              const label = metadata?.peer?.displayName ?? id;

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
        </div>
      </section>

      <CallToolbar />
    </div>
  );
};
