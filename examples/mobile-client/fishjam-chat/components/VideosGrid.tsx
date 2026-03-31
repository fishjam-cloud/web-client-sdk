import {
  type PeerId,
  type PeerWithTracks,
  type RemoteTrack,
  RTCView,
  type Track,
  usePeers,
  useVAD,
  Variant,
} from '@fishjam-cloud/react-native-client';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrandColors } from '../utils/Colors';
import NoCameraView from './NoCameraView';

const variantOptions = [
  Variant.VARIANT_LOW,
  Variant.VARIANT_MEDIUM,
  Variant.VARIANT_HIGH,
] as const;

const getVariantLabel = (variant: Variant | null | undefined) => {
  switch (variant) {
    case Variant.VARIANT_LOW:
      return 'Low';
    case Variant.VARIANT_MEDIUM:
      return 'Medium';
    case Variant.VARIANT_HIGH:
      return 'High';
    default:
      return 'N/A';
  }
};

const TrackTile = ({
  track,
  peerId,
  isSelfCamera,
}: {
  track: Track | null;
  peerId: PeerId;
  isSelfCamera?: boolean;
}) => {
  const isCamera = track?.metadata?.type === 'camera';
  const mediaStream =
    track?.stream && !track?.metadata?.paused ? track.stream : null;
  const vadStatus = useVAD({ peerIds: [peerId] });
  const isPeerSpeaking = vadStatus[peerId] && isCamera;

  return (
    <View
      style={[
        styles.videoWrapper,
        {
          backgroundColor: isSelfCamera
            ? BrandColors.seaBlue60
            : BrandColors.darkBlue60,
          borderColor: isPeerSpeaking
            ? BrandColors.seaBlue80
            : BrandColors.darkBlue100,
          borderWidth: isPeerSpeaking ? 3 : 2,
        },
      ]}>
      {mediaStream ? (
        <RTCView
          mediaStream={mediaStream}
          objectFit="cover"
          style={styles.video}
          pip={{
            enabled: !!isSelfCamera,
            startAutomatically: true,
            stopAutomatically: true,
            allowsCameraInBackground: true,
          }}
          mirror={isCamera}
        />
      ) : (
        <View style={styles.noVideoContainer}>
          <Text style={styles.noVideoText}>No video</Text>
        </View>
      )}
    </View>
  );
};

const VariantControls = ({ track }: { track: RemoteTrack }) => (
  <View style={styles.qualityControls}>
    <Text style={styles.receivedQualityLabel}>
      Received quality: {getVariantLabel(track.receivedQuality)}
    </Text>
    <View style={styles.variantsRow}>
      {variantOptions.map((variant) => {
        const isSelected = track.receivedQuality === variant;

        return (
          <Pressable
            key={variant}
            onPress={() => track.setReceivedQuality(variant)}
            disabled={isSelected}
            style={[
              styles.qualityButton,
              isSelected && styles.qualityButtonActive,
            ]}>
            <Text
              style={[
                styles.qualityButtonText,
                isSelected && styles.qualityButtonTextActive,
              ]}>
              {getVariantLabel(variant)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const LocalPeerTracks = ({
  peer,
}: {
  peer: PeerWithTracks<unknown, unknown>;
}) => {
  const hasVideoTrack = peer.cameraTrack || peer.screenShareVideoTrack;

  return (
    <>
      {peer.cameraTrack && (
        <View style={styles.gridItem}>
          <TrackTile track={peer.cameraTrack} peerId={peer.id} isSelfCamera />
        </View>
      )}
      {peer.screenShareVideoTrack && (
        <View style={styles.gridItem}>
          <TrackTile track={peer.screenShareVideoTrack} peerId={peer.id} />
        </View>
      )}
      {!hasVideoTrack && (
        <View style={styles.gridItem}>
          <TrackTile track={null} peerId={peer.id} isSelfCamera />
        </View>
      )}
    </>
  );
};

const RemotePeerTracks = ({
  peer,
}: {
  peer: PeerWithTracks<unknown, unknown, RemoteTrack>;
}) => {
  const hasVideoTrack = peer.cameraTrack || peer.screenShareVideoTrack;

  return (
    <>
      {peer.cameraTrack && (
        <View style={styles.gridItem}>
          <TrackTile track={peer.cameraTrack} peerId={peer.id} />
          <VariantControls track={peer.cameraTrack} />
        </View>
      )}
      {peer.screenShareVideoTrack && (
        <View style={styles.gridItem}>
          <TrackTile track={peer.screenShareVideoTrack} peerId={peer.id} />
        </View>
      )}
      {!hasVideoTrack && (
        <View style={styles.gridItem}>
          <TrackTile track={null} peerId={peer.id} />
        </View>
      )}
    </>
  );
};

type VideosGridProps = {
  username: string;
};

export default function VideosGrid({ username }: VideosGridProps) {
  const { localPeer, remotePeers } = usePeers();

  const hasAnyPeer = localPeer || remotePeers.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.contentContainerStyle}>
      {hasAnyPeer ? (
        <View style={styles.grid}>
          {localPeer && <LocalPeerTracks peer={localPeer} />}
          {remotePeers.map((peer) => (
            <RemotePeerTracks key={peer.id} peer={peer} />
          ))}
        </View>
      ) : (
        <NoCameraView username={username} />
      )}
      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contentContainerStyle: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridItem: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  videoWrapper: {
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderColor: BrandColors.darkBlue100,
    borderWidth: 2,
  },
  video: {
    flex: 1,
  },
  noVideoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noVideoText: {
    color: BrandColors.darkBlue100,
    fontSize: 14,
  },
  qualityControls: {
    gap: 8,
    marginTop: 8,
  },
  receivedQualityLabel: {
    color: BrandColors.darkBlue100,
    fontSize: 13,
    fontWeight: '600',
  },
  variantsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  qualityButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BrandColors.darkBlue80,
    backgroundColor: BrandColors.darkBlue20,
  },
  qualityButtonActive: {
    borderColor: BrandColors.seaBlue100,
    backgroundColor: BrandColors.seaBlue100,
  },
  qualityButtonText: {
    color: BrandColors.darkBlue100,
    fontSize: 12,
    fontWeight: '600',
  },
  qualityButtonTextActive: {
    color: BrandColors.darkBlue20,
  },
});
