import VideoPlayer from "./VideoPlayer";
import { Track } from "@fishjam-cloud/react-client";
import AudioPlayer from "./AudioPlayer";
import { Badge } from "./ui/badge";

type Props = {
  id: string;
  name: string;
  videoTrack?: Track;
  audioTrack?: Track;
};

export function Tile({ videoTrack, audioTrack, name, id }: Props) {
  const isMuted = !audioTrack || audioTrack.metadata?.paused;
  const isSpeaking = audioTrack?.vadStatus === "speech";

  return (
    <div className="w-full h-full grid place-content-center rounded-md border-2 border-stone-300 overflow-hidden relative">
      <div className="w-fit h-fit">
        {videoTrack && !videoTrack.metadata?.paused && (
          <VideoPlayer
            className="z-20 rounded-md border"
            stream={videoTrack.stream}
            peerId={id}
          />
        )}

        <AudioPlayer stream={audioTrack?.stream} />

        <Badge className="absolute z-30 bottom-0 left-0 flex gap-4 items-center text-xl">
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
