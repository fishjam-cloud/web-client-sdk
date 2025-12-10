import { Track } from '@fishjam-cloud/mobile-client';

export type GridTrack = {
  track: Track | null;
  peerId: string;
  isLocal: boolean;
  isVadActive: boolean;
  aspectRatio: number | null;
};
