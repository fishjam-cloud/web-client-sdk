import type { RefObject } from "react";
import { useEffect, useRef } from "react";

type Props = {
  stream: MediaStream | null | undefined;
  peerId: string;
};

const VideoPlayer = ({ stream, peerId }: Props) => {
  const videoRef: RefObject<HTMLVideoElement> = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream || null;
  }, [stream]);

  return <video autoPlay playsInline muted data-peer-id={peerId} ref={videoRef} />;
};

export default VideoPlayer;
