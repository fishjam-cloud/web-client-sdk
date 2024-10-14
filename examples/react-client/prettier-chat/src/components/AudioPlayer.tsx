import { FC, useEffect, useRef } from "react";

interface AudioPlayerProps {
  stream?: MediaStream | null;
}

const AudioPlayer: FC<AudioPlayerProps> = ({ stream }) => {
  const audioRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = stream ?? null;
  }, [stream]);

  return <audio autoPlay ref={audioRef} />;
};

export default AudioPlayer;
