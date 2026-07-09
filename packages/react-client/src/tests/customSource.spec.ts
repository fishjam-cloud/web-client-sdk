import { act } from "@testing-library/react";

import { useCustomSource } from "../hooks/useCustomSource";
import { usePeers } from "../hooks/usePeers";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";

const avStream = () =>
  createFakeStream([
    { kind: "video", deviceId: "v" },
    { kind: "audio", deviceId: "a" },
  ]);

describe("useCustomSource", () => {
  it("exposes no stream until one is set", ({ renderHook }) => {
    const { result } = renderHook(() => useCustomSource("cam-feed"));
    expect(result.current.stream).toBeUndefined();
  });

  it("publishes custom video + audio tracks when connected", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useCustomSource("feed"));

    act(() => client.simulateJoined());

    const stream = avStream();
    await act(async () => {
      await result.current.setStream(stream);
    });

    expect(result.current.stream).toBe(stream);
    const metas = client.addTrack.mock.calls.map((c) => (c[1] as { type: string }).type);
    expect(metas).toContain("customVideo");
    expect(metas).toContain("customAudio");
  });

  it("defers publishing until the room is joined when set before connecting", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useCustomSource("feed"));

    await act(async () => {
      await result.current.setStream(avStream());
    });
    expect(client.addTrack).not.toHaveBeenCalled();

    await act(async () => {
      client.simulateJoined();
    });

    expect(client.addTrack).toHaveBeenCalled();
  });

  it("publishes only the audio track when an audio-only room refuses the video track", async ({
    client,
    renderHook,
  }) => {
    client.simulateAudioOnlyRoom();
    const { result } = renderHook(() => ({ source: useCustomSource("feed"), peers: usePeers() }));

    act(() => client.simulateJoined());
    const stream = avStream();
    // addTrack throws TrackTypeError for the video track; setStream must
    // recover and still publish the audio track instead of rejecting.
    await act(async () => {
      await result.current.source.setStream(stream);
    });

    expect(result.current.source.stream).toBe(stream);
    expect(result.current.peers.localPeer?.customVideoTracks).toHaveLength(0);
    expect(result.current.peers.localPeer?.customAudioTracks).toHaveLength(1);
  });

  it("removes tracks when the stream is cleared", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useCustomSource("feed"));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.setStream(avStream());
    });
    await act(async () => {
      await result.current.setStream(null);
    });

    expect(client.removeTrack).toHaveBeenCalled();
    expect(result.current.stream).toBeUndefined();
  });
});
