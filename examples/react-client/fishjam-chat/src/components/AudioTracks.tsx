import type { Track } from "@fishjam-cloud/react-client";

import AudioPlayer from "./AudioPlayer";

type Props = {
  audioTracks: Track[] | undefined;
};

export function AudioTracks({ audioTracks }: Props) {
  return audioTracks?.map((audioTrack) => (
    <AudioPlayer stream={audioTrack.stream} key={audioTrack.trackId} />
  ));
}
