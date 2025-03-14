import { SetStateAction, useEffect } from "react";
import { getTrackFromStream } from "../../../utils/track";

interface HandleTrackEndProps {
  stream: MediaStream | null;
  setStream: (action: SetStateAction<MediaStream | null>) => void;
  type: "audio" | "video";
}

export const useHandleTrackEnd = ({ stream, setStream, type }: HandleTrackEndProps) => {
  useEffect(() => {
    const track = stream && getTrackFromStream(stream, type);
    if (!track) return;

    track.onended = () => {
      track.stop();
      setStream(null);
    };
  }, [type, stream, setStream]);
};
