import VideoPlayer from "./VideoPlayer";
import { Track } from "@fishjam-cloud/react-client";
import AudioVisualizer from "./AudioVisualizer";

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
    <div className="relative grid aspect-video place-content-center overflow-hidden rounded-md bg-zinc-300">
      {videoTrack && (
        <VideoPlayer
          className="z-20 rounded-md"
          stream={videoTrack.stream}
          peerId={id}
        />
      )}

      <div className="absolute bottom-2 left-0 z-30 grid w-full place-content-center text-center text-xs">
        <AudioVisualizer stream={audioTrack?.stream} />

        <div
          title={videoTrack?.trackId}
          className="flex justify-between rounded-sm bg-slate-100/60 px-1"
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
  );
}
