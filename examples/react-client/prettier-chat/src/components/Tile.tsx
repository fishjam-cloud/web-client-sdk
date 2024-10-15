import VideoPlayer from "./VideoPlayer";
import { Track } from "@fishjam-cloud/react-client";
import AudioVisualizer from "./AudioVisualizer";
import { Card, CardContent, CardTitle } from "./ui/card";
import AudioPlayer from "./AudioPlayer";

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
    <div className="w-full h-full grid place-content-center rounded-md transition-all">
      <div className="relative w-fit h-fit">
        {videoTrack && !videoTrack.metadata?.paused && (
          <VideoPlayer
            className="z-20 rounded-md border"
            stream={videoTrack.stream}
            peerId={id}
          />
        )}

        <div className="absolute bottom-0 z-30 grid place-content-center text-center text-sm w-fit bg-stone-100/60">
          <AudioVisualizer stream={audioTrack?.stream} />
          <AudioPlayer stream={audioTrack?.stream} />

          <div
            title={videoTrack?.trackId}
            className="flex justify-between rounded-md px-1"
          >
            {isMuted ? (
              <span title="Muted">🔇</span>
            ) : (
              <span title="Unmuted">🔊</span>
            )}

            <span>{name}</span>

            {isSpeaking ? (
              <span title="Speaking">🗣</span>
            ) : (
              <span title="Silent">🤐</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
