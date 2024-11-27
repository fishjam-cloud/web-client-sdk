import type { FC } from "react";
import { useEffect, useRef } from "react";

interface VideoPlayerProps extends React.HTMLAttributes<HTMLVideoElement> {
  stream?: MediaStream | null;
  peerId?: string;
}

const VideoPlayer: FC<VideoPlayerProps> = ({ stream, peerId, ...props }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  return (
    <video
      {...props}
      width="100%"
      height="auto"
      autoPlay
      playsInline
      muted
      data-peer-id={peerId}
      ref={videoRef}
    />
  );
};

export default VideoPlayer;
