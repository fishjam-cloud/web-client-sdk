import type { FishjamClient, Logger } from "@fishjam-cloud/ts-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { FakeMediaStreamTrack } from "fake-mediastreamtrack";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCustomSourceManager } from "../hooks/internal/useCustomSourceManager";
import type { PeerStatus } from "../types/public";

function makeStream({ video = true, audio = false } = {}): MediaStream {
  const videoTracks = video ? [new FakeMediaStreamTrack({ kind: "video" })] : [];
  const audioTracks = audio ? [new FakeMediaStreamTrack({ kind: "audio" })] : [];
  return {
    getVideoTracks: () => videoTracks,
    getAudioTracks: () => audioTracks,
  } as unknown as MediaStream;
}

function makeFishjamClient() {
  return {
    getLocalPeer: () => ({ metadata: { peer: { displayName: "tester" } } }),
    addTrack: vi.fn(async () => "video-id"),
    removeTrack: vi.fn(async () => undefined),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as FishjamClient;
}

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as unknown as Logger;

describe("useCustomSourceManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps setStream referentially stable across renders", () => {
    const fishjamClient = makeFishjamClient();
    const { result, rerender } = renderHook(
      ({ peerStatus }: { peerStatus: PeerStatus }) => useCustomSourceManager({ fishjamClient, peerStatus, logger }),
      { initialProps: { peerStatus: "connecting" } },
    );

    const first = result.current.setStream;
    rerender({ peerStatus: "connected" });
    expect(result.current.setStream).toBe(first);
  });

  it("keeps setStream referentially stable after publishing mutates internal state", async () => {
    const fishjamClient = makeFishjamClient();
    const { result } = renderHook(() =>
      // "connecting" so the source stays pending and no async publish effect runs — this isolates
      // the referential-stability property from the publish lifecycle.
      useCustomSourceManager({ fishjamClient, peerStatus: "connecting", logger }),
    );

    const before = result.current.setStream;
    const stream = makeStream();
    await act(async () => {
      await result.current.setStream("src-1", stream);
    });

    // Regression guard: setStream used to depend on the `sources` state, so calling it (which
    // updates that state) handed back a brand-new function every time.
    expect(result.current.setStream).toBe(before);
    expect(result.current.getSource("src-1")?.stream).toBe(stream);
  });

  it("publishes a customVideo track when connected and removes it on setStream(null)", async () => {
    const fishjamClient = makeFishjamClient();
    const { result } = renderHook(() => useCustomSourceManager({ fishjamClient, peerStatus: "connected", logger }));

    const stream = makeStream();
    await act(async () => {
      await result.current.setStream("src-1", stream);
    });

    await waitFor(() => expect(fishjamClient.addTrack).toHaveBeenCalledTimes(1));
    const [publishedTrack, publishedMetadata] = vi.mocked(fishjamClient.addTrack).mock.calls[0];
    expect(publishedTrack).toBe(stream.getVideoTracks()[0]);
    expect(publishedMetadata).toEqual({ type: "customVideo", displayName: "tester", paused: false });

    await act(async () => {
      await result.current.setStream("src-1", null);
    });

    expect(fishjamClient.removeTrack).toHaveBeenCalledWith("video-id");
    expect(result.current.getSource("src-1")).toBeUndefined();
  });
});
