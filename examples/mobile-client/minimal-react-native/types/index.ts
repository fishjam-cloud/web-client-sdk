import type { Track } from '@fishjam-cloud/react-native-client';

export type GridTrack = {
  track: Track | null;
  peerId: string;
  isLocal: boolean;
};
