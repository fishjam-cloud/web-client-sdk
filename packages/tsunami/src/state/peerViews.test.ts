import type { FishjamTrackContext, Peer, TrackMetadata } from "@fishjam-cloud/ts-client";
import { describe, expect, it, vi } from "vitest";

import { localPeerWithTracks, remotePeerWithTracks } from "./peerViews";

const buildTrackContext = (trackId: string, type: TrackMetadata["type"]): FishjamTrackContext =>
  ({
    trackId,
    metadata: { type, paused: false },
    stream: null,
    track: null,
    simulcastConfig: null,
  }) as unknown as FishjamTrackContext;

const buildPeer = (trackContexts: FishjamTrackContext[]): Peer => ({
  id: "peer-1",
  type: "webrtc",
  tracks: new Map(trackContexts.map((context) => [context.trackId, context])),
});

describe("peer views", () => {
  it("buckets tracks by their metadata type", () => {
    const peer = buildPeer([
      buildTrackContext("c", "camera"),
      buildTrackContext("m", "microphone"),
      buildTrackContext("sv", "screenShareVideo"),
      buildTrackContext("cv1", "customVideo"),
      buildTrackContext("cv2", "customVideo"),
    ]);

    const view = localPeerWithTracks(peer);

    expect(view.cameraTrack?.trackId).toBe("c");
    expect(view.microphoneTrack?.trackId).toBe("m");
    expect(view.screenShareVideoTrack?.trackId).toBe("sv");
    expect(view.screenShareAudioTrack).toBeUndefined();
    expect(view.customVideoTracks.map((track) => track.trackId)).toEqual(["cv1", "cv2"]);
    expect(view.tracks).toHaveLength(5);
  });

  it("wires remote track quality changes to the quality setter", () => {
    const peer = buildPeer([buildTrackContext("rv", "screenShareVideo")]);
    const qualitySetter = { setTargetTrackEncoding: vi.fn() };

    const view = remotePeerWithTracks(peer, qualitySetter);
    view.screenShareVideoTrack?.setReceivedQuality("h" as never);

    expect(qualitySetter.setTargetTrackEncoding).toHaveBeenCalledWith("rv", "h");
  });
});
