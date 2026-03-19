import {
  useCamera,
  useConnection,
  useMicrophone,
  usePeers,
} from '@fishjam-cloud/react-native-client';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors } from '../utils/Colors';

type DebugOverlayProps = {
  visible: boolean;
  onClose: () => void;
};

export default function DebugOverlay({ visible, onClose }: DebugOverlayProps) {
  const { peerStatus, reconnectionStatus } = useConnection();
  const { localPeer, remotePeers } = usePeers();
  const { isCameraOn } = useCamera();
  const { isMicrophoneOn } = useMicrophone();

  if (!visible) return null;

  const peerCount =
    (localPeer ? 1 : 0) + (remotePeers?.length ?? 0);

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.panel}>
        <Text style={styles.title}>Debug</Text>
        <Text style={styles.row}>peerStatus: {peerStatus}</Text>
        <Text style={styles.row}>reconnectionStatus: {reconnectionStatus}</Text>
        <Text style={styles.row}>peers in room: {peerCount}</Text>
        <Text style={styles.row}>camera on: {String(isCameraOn)}</Text>
        <Text style={styles.row}>microphone on: {String(isMicrophoneOn)}</Text>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 56,
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    minWidth: 280,
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: BrandColors.darkBlue80,
  },
  title: {
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 8,
    color: BrandColors.darkBlue100,
  },
  row: {
    fontSize: 13,
    marginBottom: 4,
    color: BrandColors.darkBlue100,
    fontFamily: 'monospace',
  },
  closeBtn: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeText: {
    color: BrandColors.seaBlue100,
    fontWeight: '600',
  },
});
