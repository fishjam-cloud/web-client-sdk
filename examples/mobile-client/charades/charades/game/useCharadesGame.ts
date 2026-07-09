/**
 * The charades game state machine, shared by both roles and driven entirely
 * by data-channel messages — no game server.
 *
 *   awaiting_round ──round_start──▶ round_active ──phrase_guessed──▶ round_won
 *        ▲                                                              │
 *        └───────────────────── 5 s banner elapses ─────────────────────┘
 *
 * Host: `startRound(phrase)` broadcasts `round_start` (and re-broadcasts it
 * whenever a new peer joins mid-round — `roundId` makes that idempotent).
 * Viewer: `announceCorrectGuess()` broadcasts `phrase_guessed`. The data
 * channel has no loopback, so both actions also apply their effect locally.
 * Stale/duplicate guards: a `round_start` for the current `roundId` and a
 * `phrase_guessed` for any other round (or outside `round_active`) are
 * ignored — with simultaneous guessers, the first message processed wins.
 */
import {
  useConnection,
  useDataChannel,
  usePeers,
} from '@fishjam-cloud/react-native-client';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import {
  decodeGameMessage,
  encodeGameMessage,
  type RoundStartMessage,
} from './protocol';
import {
  findHostPeer,
  type CharadesPeerMetadata,
  type CharadesRole,
} from './roster';

export type CharadesGamePhase = 'awaiting_round' | 'round_active' | 'round_won';

export interface CharadesRound {
  roundId: string;
  phrase: string;
  hostName: string;
}

export interface UseCharadesGameOptions {
  role: CharadesRole;
  displayName: string;
  /** Fired on every client when the winner banner elapses (host clears strokes here). */
  onRoundEnded?: () => void;
}

export interface UseCharadesGameResult {
  phase: CharadesGamePhase;
  /** Set while a round is active or just won; null between rounds. */
  currentRound: CharadesRound | null;
  /** Set while phase is 'round_won'. */
  winnerName: string | null;
  dataChannelReady: boolean;
  dataChannelError: Error | null;
  /** False on a viewer while no host peer is in the room. */
  hostIsPresent: boolean;
  /** Host only: broadcast a new round with this phrase. */
  startRound: (phrase: string) => void;
  /** Viewer only: broadcast that the local matcher detected the phrase. */
  announceCorrectGuess: () => void;
}

const WINNER_BANNER_DURATION_MS = 5000;
/**
 * A just-joined peer still has to open its own data channels before it can
 * receive anything, so the late-joiner rebroadcast waits this long.
 */
const LATE_JOINER_REBROADCAST_DELAY_MS = 2000;

interface CharadesGameState {
  phase: CharadesGamePhase;
  currentRound: CharadesRound | null;
  winnerName: string | null;
}

type CharadesGameEvent =
  | { type: 'round_started'; round: CharadesRound }
  | { type: 'round_won'; roundId: string; winnerName: string }
  | { type: 'round_reset' }
  | { type: 'host_left' };

const initialGameState: CharadesGameState = {
  phase: 'awaiting_round',
  currentRound: null,
  winnerName: null,
};

function charadesGameReducer(
  state: CharadesGameState,
  event: CharadesGameEvent,
): CharadesGameState {
  switch (event.type) {
    case 'round_started':
      // Rebroadcasts of the round we already know are no-ops.
      if (state.currentRound?.roundId === event.round.roundId) {
        return state;
      }
      return {
        phase: 'round_active',
        currentRound: event.round,
        winnerName: null,
      };
    case 'round_won':
      // Only the current round can be won, and only once.
      if (
        state.phase !== 'round_active' ||
        state.currentRound?.roundId !== event.roundId
      ) {
        return state;
      }
      return { ...state, phase: 'round_won', winnerName: event.winnerName };
    case 'round_reset':
      if (state.phase !== 'round_won') {
        return state;
      }
      return initialGameState;
    case 'host_left':
      return initialGameState;
  }
}

export function useCharadesGame(
  options: UseCharadesGameOptions,
): UseCharadesGameResult {
  const { role, displayName, onRoundEnded } = options;

  const { peerStatus } = useConnection();
  const {
    initializeDataChannel,
    publishData,
    subscribeData,
    dataChannelReady,
    dataChannelError,
  } = useDataChannel();
  const { remotePeers } = usePeers<CharadesPeerMetadata>();

  const [gameState, dispatch] = useReducer(
    charadesGameReducer,
    initialGameState,
  );

  // Live mirrors for callbacks that must read the current round/phase
  // without being recreated on every state change.
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const onRoundEndedRef = useRef(onRoundEnded);
  useEffect(() => {
    onRoundEndedRef.current = onRoundEnded;
  }, [onRoundEnded]);

  // Open the data channels once the room connection is up.
  useEffect(() => {
    if (peerStatus === 'connected' && !dataChannelReady) {
      initializeDataChannel();
    }
  }, [peerStatus, dataChannelReady, initializeDataChannel]);

  // Apply incoming game messages.
  useEffect(() => {
    const unsubscribe = subscribeData(
      (data) => {
        const message = decodeGameMessage(data);
        if (!message) {
          return;
        }
        if (message.kind === 'round_start') {
          dispatch({
            type: 'round_started',
            round: {
              roundId: message.roundId,
              phrase: message.phrase,
              hostName: message.hostName,
            },
          });
        } else {
          dispatch({
            type: 'round_won',
            roundId: message.roundId,
            winnerName: message.guesserName,
          });
        }
      },
      { reliable: true },
    );
    return unsubscribe;
  }, [subscribeData]);

  // Winner banner: after 5 s every client resets to the next round locally.
  useEffect(() => {
    if (gameState.phase !== 'round_won') {
      return;
    }
    const bannerTimer = setTimeout(() => {
      dispatch({ type: 'round_reset' });
      onRoundEndedRef.current?.();
    }, WINNER_BANNER_DURATION_MS);
    return () => clearTimeout(bannerTimer);
  }, [gameState.phase]);

  // Host: when the room grows mid-round, re-send the current round so late
  // joiners can play (their reducer dedupes it everywhere else).
  const previousRemotePeerCountRef = useRef(0);
  useEffect(() => {
    const previousCount = previousRemotePeerCountRef.current;
    previousRemotePeerCountRef.current = remotePeers.length;

    if (
      role !== 'host' ||
      remotePeers.length <= previousCount ||
      !dataChannelReady
    ) {
      return;
    }
    const round = gameStateRef.current.currentRound;
    if (gameStateRef.current.phase !== 'round_active' || !round) {
      return;
    }
    const rebroadcastTimer = setTimeout(() => {
      const message: RoundStartMessage = { kind: 'round_start', ...round };
      publishData(encodeGameMessage(message), { reliable: true });
    }, LATE_JOINER_REBROADCAST_DELAY_MS);
    return () => clearTimeout(rebroadcastTimer);
  }, [remotePeers.length, role, dataChannelReady, publishData]);

  // Viewer: when the host disappears, drop back to waiting.
  const wasHostPresentRef = useRef(false);
  const hostIsPresent =
    role === 'host' || findHostPeer(remotePeers) !== undefined;
  useEffect(() => {
    if (role === 'host') {
      return;
    }
    if (wasHostPresentRef.current && !hostIsPresent) {
      dispatch({ type: 'host_left' });
    }
    wasHostPresentRef.current = hostIsPresent;
  }, [role, hostIsPresent]);

  const startRound = useCallback(
    (phrase: string) => {
      const trimmedPhrase = phrase.trim();
      if (!trimmedPhrase) {
        return;
      }
      const round: CharadesRound = {
        roundId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        phrase: trimmedPhrase,
        hostName: displayName,
      };
      const message: RoundStartMessage = { kind: 'round_start', ...round };
      publishData(encodeGameMessage(message), { reliable: true });
      // No loopback: apply the round locally too.
      dispatch({ type: 'round_started', round });
    },
    [displayName, publishData],
  );

  const announceCorrectGuess = useCallback(() => {
    const { phase, currentRound } = gameStateRef.current;
    if (phase !== 'round_active' || !currentRound) {
      return;
    }
    publishData(
      encodeGameMessage({
        kind: 'phrase_guessed',
        roundId: currentRound.roundId,
        guesserName: displayName,
        phrase: currentRound.phrase,
      }),
      { reliable: true },
    );
    // No loopback: show the win locally too.
    dispatch({
      type: 'round_won',
      roundId: currentRound.roundId,
      winnerName: displayName,
    });
  }, [displayName, publishData]);

  return {
    phase: gameState.phase,
    currentRound: gameState.currentRound,
    winnerName: gameState.winnerName,
    dataChannelReady,
    dataChannelError,
    hostIsPresent,
    startRound,
    announceCorrectGuess,
  };
}
