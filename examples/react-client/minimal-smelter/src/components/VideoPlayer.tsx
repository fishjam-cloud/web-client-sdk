import { useEffect, useRef } from "react";

type Props = {
  stream: MediaStream | null | undefined;
};

const VideoPlayer = ({ stream }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  return <video autoPlay playsInline muted ref={videoRef} />;
};

export default VideoPlayer;
