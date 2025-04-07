import { FC, useRef, useEffect } from "react";

interface AudioPlayerProps {
  track: MediaStreamTrack | null | undefined;
}

export const AudioPlayer: FC<AudioPlayerProps> = ({ track }) => {
  const audioRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    const stream = track ? new MediaStream([track]) : null;

    audioRef.current.srcObject = stream;
  }, [track]);

  return <audio autoPlay ref={audioRef} />;
};
