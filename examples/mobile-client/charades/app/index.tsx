import { useConnection, useSandbox } from '@fishjam-cloud/react-native-client';
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components';
import {
  CharadesCanvas,
  CharadesTouchOverlay,
  createMockHandSource,
  GuessBanner,
  PhraseEntry,
  useCharadesCameraEffect,
  useCharadesGame,
  useHandTrackingModels,
  ViewerGameSection,
  ViewerTilesStrip,
  type CharadesRole,
} from '../charades';
import { BrandColors } from '../utils/Colors';

/**
 * Catches render errors from the camera stack so the rest of the screen keeps
 * working. Concretely: on the iOS SIMULATOR VisionCamera's orientation hook
 * throws ("accelerometer is not available"), which would otherwise red-screen
 * the whole tab — with the boundary, everything except the live camera section
 * (join flow, model smoke test) stays usable in simulator QA runs.
 */
class CameraSectionErrorBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown) {
    return { message: String(error) };
  }

  render() {
    if (this.state.message != null) {
      return (
        <Text style={styles.cameraStatus}>
          Camera unavailable on this device: {this.state.message}
        </Text>
      );
    }
    return this.props.children;
  }
}

/**
 * Everything that depends on the camera stack (VisionCamera + WebGPU custom
 * track). Isolated in its own component so a camera-stack render error hits
 * the boundary above without unmounting the join flow, and so the camera
 * pipeline only spins up once the user has actually joined the room.
 */
function CharadesCameraSection({ displayName }: { displayName: string }) {
  // WebGPU camera-passthrough effect. Mounted unconditionally (hook order); the
  // `cameraEnabled` flag drives VisionCamera + the custom track on/off.
  const [cameraEnabled, setCameraEnabled] = useState(false);

  // Touch-driven brush input — the FALLBACK cursor while no hand is tracked
  // (and the only input on simulators, where the camera hand path can't run).
  // Stable across renders so the onFrame worklet's capture of its
  // Synchronizable cursor never churns.
  const handSource = useMemo(() => createMockHandSource(), []);

  // Live pinch-to-draw: once loaded, the models drive the brush cursor from
  // the camera inside the onFrame worklet (touch stays as fallback).
  const handTrackingModels = useHandTrackingModels();

  const {
    localStream,
    deviceReady,
    hasCameraPermission,
    status: cameraStatus,
    requestCameraPermission,
  } = useCharadesCameraEffect(cameraEnabled, handSource, handTrackingModels);

  // Host side of the game: rounds are broadcast over the data channel; when
  // the winner banner elapses, the drawing is wiped for the next round.
  const handleRoundEnded = useCallback(() => {
    handSource.clear();
  }, [handSource]);

  const game = useCharadesGame({
    role: 'host',
    displayName,
    onRoundEnded: handleRoundEnded,
  });

  // Drive the source lifecycle with the camera even though the mock's
  // start/stop are no-ops — keeps the contract correct for P11's real source.
  useEffect(() => {
    if (!cameraEnabled) {
      return;
    }
    void handSource.start();
    return () => {
      handSource.stop();
    };
  }, [cameraEnabled, handSource]);

  // Mirror WebGPUCameraToggle's gating: require the GPUDevice, then the camera
  // permission, before enabling the effect.
  const handleStartCamera = useCallback(() => {
    if (!deviceReady) {
      console.warn('CharadesScreen: GPUDevice not ready yet.');
      return;
    }
    if (!hasCameraPermission) {
      requestCameraPermission();
      return;
    }
    setCameraEnabled(true);
  }, [deviceReady, hasCameraPermission, requestCameraPermission]);

  const handleStopCamera = useCallback(() => {
    setCameraEnabled(false);
  }, []);

  if (!cameraEnabled) {
    return (
      <>
        <Text style={styles.cameraStatus}>
          {deviceReady ? cameraStatus : 'Preparing GPU…'}
        </Text>
        <View style={styles.button}>
          <Button
            title="Start Camera"
            onPress={handleStartCamera}
            disabled={!deviceReady}
          />
        </View>
      </>
    );
  }

  // GAME UI: a full-screen Modal (covers the tab bar) with the video filling
  // the screen and minimal floating controls — the pinch gesture is the
  // primary input, touch-drag the fallback.
  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleStopCamera}
    >
      <View style={styles.gameContainer}>
        <CharadesCanvas stream={localStream} />
        <CharadesTouchOverlay handSource={handSource} hover={false} />
        <ViewerTilesStrip />
        {game.phase === 'awaiting_round' && (
          <PhraseEntry
            onSubmitPhrase={game.startRound}
            disabled={!game.dataChannelReady}
          />
        )}
        {game.phase === 'round_active' && game.currentRound != null && (
          <View style={styles.phrasePill} pointerEvents="none">
            <Text style={styles.phrasePillText}>
              Drawing: {game.currentRound.phrase}
            </Text>
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
        {game.dataChannelError != null && (
          <View style={styles.dataChannelErrorPill} pointerEvents="none">
            <Text style={styles.dataChannelErrorText}>
              Game messages unavailable: {game.dataChannelError.message}
            </Text>
          </View>
        )}
        <View style={styles.gameTopBar} pointerEvents="box-none">
          <Pressable style={styles.gameCloseButton} onPress={handleStopCamera}>
            <Text style={styles.gameCloseText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.gameBottomBar} pointerEvents="box-none">
          <Pressable
            style={styles.gameClearButton}
            onPress={() => handSource.clear()}
          >
            <Text style={styles.gameClearText}>Clear</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const ROOM_NAME = 'charades-room';

type ConnectionStatus = 'idle' | 'joining' | 'joined' | 'error';

export default function CharadesScreen() {
  const { getSandboxPeerToken } = useSandbox({
    sandboxApiUrl: process.env.EXPO_PUBLIC_SANDBOX_API_URL ?? '',
  });
  const { joinRoom, leaveRoom } = useConnection();

  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<CharadesRole | null>(null);

  // The sandbox room manager keys peers by name, so every viewer needs a
  // distinct one; the single fixed "Host" name doubles as a one-host lock.
  // Generated in the join handler (Math.random during render is impure —
  // react-hooks/purity) and kept in state so it stays stable across re-joins.
  const [viewerName, setViewerName] = useState('');

  const hasJoinedRef = useRef(false);

  const handleJoinRoom = useCallback(
    async (selectedRole: CharadesRole) => {
      try {
        setStatus('joining');
        setRole(selectedRole);
        setError(null);

        const resolvedViewerName =
          viewerName || `Viewer-${Math.random().toString(36).slice(2, 6)}`;
        if (resolvedViewerName !== viewerName) {
          setViewerName(resolvedViewerName);
        }
        const displayName = selectedRole === 'host' ? 'Host' : resolvedViewerName;
        const peerToken = await getSandboxPeerToken(ROOM_NAME, displayName);

        await joinRoom({
          peerToken,
          peerMetadata: {
            displayName,
            role: selectedRole,
          },
        });

        hasJoinedRef.current = true;
        setStatus('joined');
      } catch (err) {
        console.error('Failed to join room:', err);
        setStatus('error');
        setError('Failed to join room. Please try again.');
      }
    },
    [getSandboxPeerToken, joinRoom, viewerName],
  );

  const handleLeaveRoom = useCallback(() => {
    // Flipping status unmounts the game section, whose effect cleanup
    // (which runs after this handler) tears down the published tracks.
    try {
      leaveRoom();
    } catch (err) {
      console.error('Failed to leave room:', err);
    }
    hasJoinedRef.current = false;
    setStatus('idle');
    setRole(null);
    setError(null);
  }, [leaveRoom]);

  useEffect(() => {
    return () => {
      if (hasJoinedRef.current) {
        try {
          leaveRoom();
        } catch (err) {
          console.error('Failed to leave room:', err);
        }
        hasJoinedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isJoining = status === 'joining';
  const isJoined = status === 'joined';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.heading}>Charades</Text>
      <Text style={styles.roomName}>{ROOM_NAME}</Text>

      <Text style={styles.description}>
        The host draws with a pinch gesture; viewers guess out loud. Join as a
        host to draw, or as a viewer to watch and guess.
      </Text>

      {isJoined && role === 'host' && (
        <View style={styles.joinedContainer}>
          <Text style={styles.statusText}>Hosting {ROOM_NAME}</Text>

          <CameraSectionErrorBoundary>
            <CharadesCameraSection displayName="Host" />
          </CameraSectionErrorBoundary>

          <View style={styles.button}>
            <Button
              title="Leave Room"
              type="secondary"
              onPress={handleLeaveRoom}
            />
          </View>
        </View>
      )}

      {isJoined && role === 'viewer' && (
        <ViewerGameSection displayName={viewerName} onLeave={handleLeaveRoom} />
      )}

      {!isJoined && (
        <View style={styles.roleButtons}>
          <View style={styles.button}>
            <Button
              title={
                isJoining && role === 'host' ? 'Joining...' : 'Join as Host'
              }
              onPress={() => handleJoinRoom('host')}
              disabled={isJoining}
            />
          </View>
          <View style={styles.button}>
            <Button
              title={
                isJoining && role === 'viewer'
                  ? 'Joining...'
                  : 'Join as Viewer'
              }
              type="secondary"
              onPress={() => handleJoinRoom('viewer')}
              disabled={isJoining}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1FAFE',
    padding: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: BrandColors.darkBlue100,
  },
  roomName: {
    fontSize: 16,
    color: BrandColors.darkBlue80,
    marginTop: 4,
  },
  description: {
    fontSize: 14,
    color: BrandColors.darkBlue100,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  joinedContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  roleButtons: {
    width: '100%',
    gap: 12,
  },
  gameContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  phrasePill: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  phrasePillText: {
    color: '#fff',
    fontSize: 14,
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
  gameTopBar: {
    position: 'absolute',
    top: 54,
    right: 20,
  },
  gameCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameCloseText: {
    color: '#fff',
    fontSize: 18,
  },
  gameBottomBar: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  gameClearButton: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  gameClearText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: BrandColors.darkBlue100,
  },
  cameraStatus: {
    fontSize: 13,
    color: BrandColors.darkBlue80,
    textAlign: 'center',
  },
  button: {
    width: '100%',
  },
  errorText: {
    color: 'red',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
});
