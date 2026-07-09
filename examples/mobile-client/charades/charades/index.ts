export {
  useCharadesCameraEffect,
  type UseCharadesCameraEffectResult,
} from './useCharadesCameraEffect';
export { CharadesCanvas } from './ui/CharadesCanvas';
export { CharadesTouchOverlay } from './ui/CharadesTouchOverlay';
export { ViewerTilesStrip } from './ui/ViewerTilesStrip';
export { ViewerGameSection } from './ui/ViewerGameSection';
export { PhraseEntry } from './ui/PhraseEntry';
export { GuessBanner } from './ui/GuessBanner';

export {
  findHostPeer,
  selectViewerPeers,
  type CharadesPeerMetadata,
  type CharadesRole,
} from './game/roster';
export {
  encodeGameMessage,
  decodeGameMessage,
  type CharadesGameMessage,
} from './game/protocol';
export {
  useCharadesGame,
  type CharadesGamePhase,
  type CharadesRound,
  type UseCharadesGameResult,
} from './game/useCharadesGame';
export {
  useGuessDetection,
  type UseGuessDetectionResult,
} from './game/useGuessDetection';

export type { HandSource, CursorState, CursorSync } from './hand/HandSource';
export { createMockHandSource, type MockHandSource } from './hand/MockHandSource';

export { useHandTrackingModels } from './hand/useHandTrackingModels';
