/**
 * Small camera tiles of the VIEWERS, overlaid near the bottom of the game
 * screen. Both roles render this strip over the full-screen host video, so
 * the game looks the same everywhere: big drawing, small guesser faces.
 *
 * The host peer is excluded (their "camera" is the drawing composite that
 * already fills the screen). On a viewer device the local self tile comes
 * first. Speaking viewers get a highlighted border via voice activity
 * detection, mirroring the pattern in `components/VideosGrid.tsx`.
 */
import {
  RTCView,
  usePeers,
  useVAD,
  type PeerId,
  type Track,
} from '@fishjam-cloud/react-native-client';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { selectViewerPeers, type CharadesPeerMetadata } from '../game/roster';

function ViewerTile({
  peerId,
  displayName,
  track,
  isSelf,
}: {
  peerId: PeerId;
  displayName: string;
  track: Track | null;
  isSelf: boolean;
}) {
  const voiceActivity = useVAD({ peerIds: [peerId] });
  const isSpeaking = !!voiceActivity[peerId];
  const mediaStream =
    track?.stream && !track.metadata?.paused ? track.stream : null;

  return (
    <View style={styles.tile}>
      <View
        style={[
          styles.tileVideoWrapper,
          isSpeaking && styles.tileVideoWrapperSpeaking,
        ]}>
        {mediaStream ? (
          <RTCView
            mediaStream={mediaStream}
            objectFit="cover"
            style={styles.tileVideo}
            mirror
          />
        ) : (
          <View style={styles.tileNoVideo}>
            <Text style={styles.tileNoVideoText}>No video</Text>
          </View>
        )}
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {isSelf ? 'You' : displayName}
      </Text>
    </View>
  );
}

export function ViewerTilesStrip() {
  const { localPeer, remotePeers } = usePeers<CharadesPeerMetadata>();

  const remoteViewers = selectViewerPeers(remotePeers);
  const localIsViewer = localPeer?.metadata?.peer?.role === 'viewer';

  if (!localIsViewer && remoteViewers.length === 0) {
    return null;
  }

  return (
    <View style={styles.strip} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContent}>
        {localIsViewer && localPeer && (
          <ViewerTile
            peerId={localPeer.id}
            displayName={localPeer.metadata?.peer?.displayName ?? 'You'}
            track={localPeer.cameraTrack ?? null}
            isSelf
          />
        )}
        {remoteViewers.map((peer) => (
          <ViewerTile
            key={peer.id}
            peerId={peer.id}
            displayName={peer.metadata?.peer?.displayName ?? 'Viewer'}
            track={peer.cameraTrack ?? null}
            isSelf={false}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 108,
  },
  stripContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  tile: {
    width: 84,
    alignItems: 'center',
  },
  tileVideoWrapper: {
    width: 84,
    height: 112,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  tileVideoWrapperSpeaking: {
    borderColor: '#4ade80',
  },
  tileVideo: {
    flex: 1,
  },
  tileNoVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileNoVideoText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
  },
  tileName: {
    marginTop: 4,
    maxWidth: 84,
    color: '#fff',
    fontSize: 11,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowRadius: 3,
  },
});
