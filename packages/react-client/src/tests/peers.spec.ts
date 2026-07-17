import { act } from "@testing-library/react";

import { usePeers } from "../hooks/usePeers";
import { createFakeTrack } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";

const cameraMeta = { type: "camera", paused: false } as const;
const micMeta = { type: "microphone", paused: false } as const;
const screenVideoMeta = { type: "screenShareVideo", paused: false } as const;
const customVideoMeta = { type: "customVideo", paused: false } as const;

describe("usePeers", () => {
  it("returns null localPeer and empty remotePeers before joining", ({ renderHook }) => {
    const { result } = renderHook(() => usePeers());
    expect(result.current.localPeer).toBeNull();
    expect(result.current.remotePeers).toEqual([]);
  });

  it("buckets local peer tracks by metadata type", ({ client, renderHook }) => {
    const { result } = renderHook(() => usePeers());

    act(() => {
      client.setLocalPeer({
        id: "local-peer",
        metadata: { peer: { displayName: "me" }, server: {} },
        tracks: [
          { trackId: "c", metadata: cameraMeta, track: createFakeTrack({ kind: "video" }) },
          { trackId: "m", metadata: micMeta, track: createFakeTrack({ kind: "audio" }) },
        ],
      });
    });

    const local = result.current.localPeer!;
    expect(local.id).toBe("local-peer");
    expect(local.cameraTrack?.trackId).toBe("c");
    expect(local.microphoneTrack?.trackId).toBe("m");
    expect(local.tracks).toHaveLength(2);
  });

  it("buckets remote peer tracks including screen share and custom tracks", ({ client, renderHook }) => {
    const { result } = renderHook(() => usePeers());

    act(() => {
      client.addRemotePeer({
        id: "p1",
        tracks: [
          { trackId: "rv", metadata: screenVideoMeta, track: createFakeTrack({ kind: "video" }) },
          { trackId: "cv", metadata: customVideoMeta, track: createFakeTrack({ kind: "video" }) },
        ],
      });
    });

    const peer = result.current.remotePeers[0];
    expect(peer.id).toBe("p1");
    expect(peer.screenShareVideoTrack?.trackId).toBe("rv");
    expect(peer.customVideoTracks.map((t) => t.trackId)).toEqual(["cv"]);
  });

  it("keeps the deprecated `peers` alias equal to remotePeers", ({ client, renderHook }) => {
    const { result } = renderHook(() => usePeers());
    act(() => {
      client.addRemotePeer({ id: "p1" });
    });
    expect(result.current.peers).toEqual(result.current.remotePeers);
  });

  it("remote tracks expose setReceivedQuality wired to setTargetTrackEncoding", ({ client, renderHook }) => {
    const { result } = renderHook(() => usePeers());
    act(() => {
      client.addRemotePeer({
        id: "p1",
        tracks: [{ trackId: "rv", metadata: screenVideoMeta, track: createFakeTrack({ kind: "video" }) }],
      });
    });

    act(() => result.current.remotePeers[0].screenShareVideoTrack!.setReceivedQuality("h" as never));
    expect(client.setTargetTrackEncoding).toHaveBeenCalledWith("rv", "h");
  });

  it("setReceivedTracksQuality applies quality to every track id", ({ client, renderHook }) => {
    const { result } = renderHook(() => usePeers());
    act(() => result.current.setReceivedTracksQuality(["a", "b"], "m" as never));
    expect(client.setTargetTrackEncoding).toHaveBeenCalledWith("a", "m");
    expect(client.setTargetTrackEncoding).toHaveBeenCalledWith("b", "m");
  });
});
