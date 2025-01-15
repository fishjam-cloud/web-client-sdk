import { type Track, useVAD } from "@fishjam-cloud/react-client";

import AudioPlayer from "./AudioPlayer";
import { Badge } from "./ui/badge";
import VideoPlayer from "./VideoPlayer";

type Props = {
  id: string;
  name: string;
  videoTrack?: Track;
  audioTrack?: Track;
};

export function Tile({ videoTrack, audioTrack, name, id }: Props) {
  const isMuted = !audioTrack || audioTrack.metadata?.paused;
  const { [id]: isSpeaking } = useVAD([id]);

  return (
    <div className="relative grid h-full w-full place-content-center overflow-hidden rounded-md border-2 border-stone-300">
      <div className="h-fit w-fit">
        {videoTrack && !videoTrack.metadata?.paused && (
          <VideoPlayer
            className="z-20 rounded-md border"
            stream={videoTrack.stream}
            peerId={id}
          />
        )}

        <AudioPlayer stream={audioTrack?.stream} />

        <Badge className="absolute bottom-0 left-0 z-30 flex items-center gap-4 text-xl">
          <span className="text-sm">{name}</span>

          {isMuted ? (
            <span title="Muted">🔇</span>
          ) : (
            <span title="Unmuted">🔊</span>
          )}

          {isSpeaking ? (
            <span title="Speaking">🗣</span>
          ) : (
            <span title="Silent">🤐</span>
          )}
        </Badge>
      </div>
    </div>
  );
}
