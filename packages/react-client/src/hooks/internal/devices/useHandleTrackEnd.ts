import { useEffect } from "react";

interface HandleTrackEndProps {
  track: MediaStreamTrack | null;
  clearStream: () => void;
}

export const useHandleTrackEnd = ({ track, clearStream }: HandleTrackEndProps) => {
  useEffect(() => {
    if (!track) return;

    track.onended = () => {
      track.stop();
      clearStream();
    };
  }, [track, clearStream]);
};
