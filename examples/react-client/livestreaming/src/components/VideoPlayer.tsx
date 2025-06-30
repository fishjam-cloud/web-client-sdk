import { type HTMLAttributes, useEffect, useRef } from "react";

type Props = {
  stream: MediaStream | null | undefined;
} & HTMLAttributes<HTMLVideoElement>;

const VideoPlayer = ({ stream, ...props }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  return (
    <video {...props} autoPlay playsInline muted controls ref={videoRef} />
  );
};

export default VideoPlayer;
