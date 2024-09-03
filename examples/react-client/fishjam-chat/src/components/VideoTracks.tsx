import VideoPlayer from "./VideoPlayer";
import { Track } from "@fishjam-cloud/react-client";

type Props = {
  id: string;
  name: string;
  videoTracks: Track[];
};

export function VideoTracks({ videoTracks, name, id }: Props) {
  return videoTracks.map((videoTrack) => (
    <div
      className="aspect-video overflow-hidden grid place-content-center relative bg-zinc-300 rounded-md"
      key={videoTrack.trackId}
    >
      {videoTrack && (
        <VideoPlayer
          className="rounded-md z-20"
          key={videoTrack.trackId}
          stream={videoTrack.stream}
          peerId={id}
        />
      )}

      <div className="absolute bottom-2 left-0 w-full grid place-content-center text-center text-xs z-30">
        <p className="bg-slate-100/60 px-1 rounded-sm">{name}</p>
      </div>
    </div>
  ));
}
