import { CSSProperties, RefObject, useEffect, useRef } from "react";

type Props = {
  stream: MediaStream | null | undefined;
  innerStyles?: CSSProperties;
};

const VideoPlayer = ({ stream, innerStyles }: Props) => {
  const videoRef: RefObject<HTMLVideoElement> = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream || null;
  }, [stream]);

  return <video className="w-full" style={innerStyles} autoPlay playsInline controls={false} muted ref={videoRef} />;
};

export default VideoPlayer;
