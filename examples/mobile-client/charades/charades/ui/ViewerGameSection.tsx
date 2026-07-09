/**
 * Full-screen game view for a VIEWER: the host's charades video fills the
 * screen, the viewers' small camera tiles float near the bottom.
 *
 * On mount (once media permissions are granted) the viewer publishes their
 * plain SDK camera + microphone to the room — the camera feeds everyone's
 * tiles strip, the microphone lets the host hear guesses (and later feeds
 * the local speech-to-text guess detection). Note the "VisionCamera is the
 * sole camera owner" constraint applies only to the HOST device (which runs
 * the drawing pipeline); viewers use the regular SDK camera.
 *
 * Game flow (see useCharadesGame): waits for the host's round, shows a
 * "guess out loud" prompt while a round runs, and a winner banner when
 * someone gets it. Guesses are detected by on-device speech-to-text
 * (useGuessDetection) running on this viewer's own microphone; the manual
 * guess button remains as the simulator/model-still-downloading fallback.
 */
import {
  useCamera,
  useInitializeDevices,
  useMicrophone,
  usePeers,
} from '@fishjam-cloud/react-native-client';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMediaPermissions } from '../../hooks/useMediaPermissions';
import { findHostPeer, type CharadesPeerMetadata } from '../game/roster';
import { useCharadesGame } from '../game/useCharadesGame';
import { useGuessDetection } from '../game/useGuessDetection';
import { CharadesCanvas } from './CharadesCanvas';
import { GuessBanner } from './GuessBanner';
import { ViewerTilesStrip } from './ViewerTilesStrip';

type ViewerMediaStatus = 'initializing' | 'ready' | 'error';

export function ViewerGameSection({
  displayName,
  onLeave,
}: {
  displayName: string;
  onLeave: () => void;
}) {
  const { permissionsGranted, openSettings } = useMediaPermissions();
  const { initializeDevices } = useInitializeDevices();
  const { toggleCamera, stopCamera } = useCamera();
  const { toggleMicrophone, stopMicrophone } = useMicrophone();

  const [mediaStatus, setMediaStatus] =
    useState<ViewerMediaStatus>('initializing');

  useEffect(() => {
    if (!permissionsGranted) {
      return;
    }
    let cancelled = false;
    const setUpViewerMedia = async () => {
      try {
        await initializeDevices({ enableVideo: true, enableAudio: true });
        // The viewer is already CONNECTED here (the screen joins the room
        // before media starts), and the SDK only PUBLISHES tracks on the
        // 'joined' event or through toggleDevice — the raw startCamera/
        // startMicrophone merely start the local device and nothing would
        // ever reach the room. Enable via the toggles, which publish when
        // connected (both are off on a fresh mount, so this always enables).
        const cameraError = await toggleCamera();
        const microphoneError = await toggleMicrophone();
        if (cameraError || microphoneError) {
          console.error(
            'ViewerGameSection: device error:',
            cameraError ?? microphoneError,
          );
          if (!cancelled) {
            setMediaStatus('error');
          }
          return;
        }
        if (!cancelled) {
          setMediaStatus('ready');
        }
      } catch (error) {
        console.error('ViewerGameSection: failed to start camera/mic:', error);
        if (!cancelled) {
          setMediaStatus('error');
        }
      }
    };
    void setUpViewerMedia();
    return () => {
      cancelled = true;
      stopCamera();
      stopMicrophone();
    };
    // Mirrors app/room/preview.tsx: run once per permission grant; the SDK
    // hook functions are not referentially stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsGranted]);

  const { remotePeers } = usePeers<CharadesPeerMetadata>();
  const hostPeer = findHostPeer(remotePeers);
  const hostStream = hostPeer?.cameraTrack?.stream ?? null;

  const game = useCharadesGame({ role: 'viewer', displayName });

  const guessDetection = useGuessDetection({
    enabled: game.phase === 'round_active',
    targetPhrase: game.currentRound?.phrase ?? null,
    onPhraseGuessed: game.announceCorrectGuess,
  });

  // Feedback that the microphone → speech-to-text path is alive: the last
  // few words the model heard, shown under the video while a round runs.
  const lastHeardWords = guessDetection.liveTranscript
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(-3)
    .join(' ');

  const statusLine =
    game.phase === 'round_active'
      ? guessDetection.modelReady
        ? '🎙️ Guess out loud!'
        : `Speech model downloading… ${Math.round(
            guessDetection.modelDownloadProgress * 100,
          )}%`
      : game.phase === 'awaiting_round' && game.hostIsPresent
        ? 'Waiting for the host to start a round…'
        : null;

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onLeave}
    >
      <View style={styles.gameContainer}>
        <CharadesCanvas
          stream={hostStream}
          placeholderText={
            hostPeer ? 'Starting host video…' : 'Waiting for the host…'
          }
        />
        <ViewerTilesStrip />
        {statusLine != null && (
          <View style={styles.statusPill} pointerEvents="none">
            <Text style={styles.statusPillText}>{statusLine}</Text>
          </View>
        )}
        {game.phase === 'round_won' &&
          game.winnerName != null &&
          game.currentRound != null && (
            <GuessBanner
              winnerName={game.winnerName}
              phrase={game.currentRound.phrase}
            />
          )}
        {game.phase === 'round_active' && (
          <View style={styles.bottomBar} pointerEvents="box-none">
            {lastHeardWords.length > 0 && (
              <View style={styles.heardPill}>
                <Text style={styles.heardPillText} numberOfLines={1}>
                  Heard: …{lastHeardWords}
                </Text>
              </View>
            )}
            {guessDetection.modelError != null && (
              <Text style={styles.liveTranscript} numberOfLines={2}>
                Speech model error: {guessDetection.modelError}
              </Text>
            )}
            <Pressable
              style={styles.manualGuessButton}
              onPress={game.announceCorrectGuess}>
              <Text style={styles.manualGuessText}>Manual guess (fallback)</Text>
            </Pressable>
          </View>
        )}
        {game.dataChannelError != null && (
          <View style={styles.dataChannelErrorPill} pointerEvents="none">
            <Text style={styles.dataChannelErrorText}>
              Game messages unavailable: {game.dataChannelError.message}
            </Text>
          </View>
        )}
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable style={styles.closeButton} onPress={onLeave}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>
        {permissionsGranted === false && (
          <View style={styles.mediaNotice} pointerEvents="box-none">
            <Text style={styles.mediaNoticeText}>
              Camera and microphone access is needed to play.
            </Text>
            <Pressable style={styles.mediaNoticeButton} onPress={openSettings}>
              <Text style={styles.mediaNoticeButtonText}>Open Settings</Text>
            </Pressable>
          </View>
        )}
        {mediaStatus === 'error' && (
          <View style={styles.mediaNotice} pointerEvents="box-none">
            <Text style={styles.mediaNoticeText}>
              Failed to start your camera or microphone.
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gameContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  statusPill: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  statusPillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  liveTranscript: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowRadius: 3,
  },
  heardPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  heardPillText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
  },
  manualGuessButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  manualGuessText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dataChannelErrorPill: {
    position: 'absolute',
    bottom: 96,
    left: 24,
    right: 24,
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(127, 29, 29, 0.8)',
  },
  dataChannelErrorText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 54,
    right: 20,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
  },
  mediaNotice: {
    position: 'absolute',
    top: 110,
    left: 20,
    right: 20,
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  mediaNoticeText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  mediaNoticeButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  mediaNoticeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
