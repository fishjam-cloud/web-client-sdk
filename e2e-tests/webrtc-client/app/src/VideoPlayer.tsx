import { useEffect, useRef } from "react";

type Props = {
  stream?: MediaStream;
  id?: string;
};

export const VideoPlayer = ({ stream, id }: Props) => {
  const heartRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!heartRef.current) return;
    heartRef.current.srcObject = stream || null;
  }, [stream]);

  return <video id={id} style={{ maxHeight: "90px" }} autoPlay playsInline controls={false} muted ref={heartRef} />;
};
