import { useEffect } from "react";

export const useHandleTrackEnd = (track: MediaStreamTrack | null, clearStream: () => void) => {
  useEffect(() => {
    if (!track) return;

    track.onended = () => {
      track.stop();
      clearStream();
    };
  }, [track, clearStream]);
};
