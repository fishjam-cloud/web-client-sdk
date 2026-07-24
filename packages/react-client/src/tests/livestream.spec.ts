import { LivestreamError, publishLivestream, receiveLivestream } from "@fishjam-cloud/ts-client";
import { act } from "@testing-library/react";
import { vi } from "vitest";

import { useLivestreamStreamer } from "../hooks/useLivestreamStreamer";
import { useLivestreamViewer } from "../hooks/useLivestreamViewer";
import type { FakeMediaStream } from "./support/fakeMediaStream";
import { createFakeStream } from "./support/fakeMediaStream";
import { beforeEach, describe, expect, it } from "./support/fixtures";

// Keep FishjamClient / getLogger / LivestreamError real; stub only the WHIP/WHEP fns.
vi.mock("@fishjam-cloud/ts-client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, publishLivestream: vi.fn(), receiveLivestream: vi.fn() };
});

const asConnected = { connectionState: "connected" } as RTCPeerConnection;

type ConnCb = (pc: RTCPeerConnection) => void;

describe("useLivestreamStreamer", () => {
  beforeEach(() => vi.mocked(publishLivestream).mockClear());

  it("publishes the given video stream and tracks connection state", async ({ renderHook }) => {
    let onChange: ConnCb = () => {};
    const stopPublishing = vi.fn();
    // The 4th arg carries the connection-state callback. Read it defensively:
    // testing-library's unmount can invoke the spy again during teardown.
    vi.mocked(publishLivestream).mockImplementation(async (...args) => {
      const cbs = args[3] as { onConnectionStateChange?: ConnCb } | undefined;
      if (cbs?.onConnectionStateChange) onChange = cbs.onConnectionStateChange;
      return { stopPublishing } as never;
    });

    const { result } = renderHook(() => useLivestreamStreamer());

    await act(async () => {
      await result.current.connect({ inputs: { video: createFakeStream([{ kind: "video" }]) }, token: "t" });
    });

    expect(publishLivestream).toHaveBeenCalledTimes(1);
    const publishedStream = vi.mocked(publishLivestream).mock.calls[0][0] as FakeMediaStream;
    expect(publishedStream.getVideoTracks()).toHaveLength(1);
    expect(result.current.isConnected).toBe(false);

    act(() => onChange(asConnected));
    expect(result.current.isConnected).toBe(true);

    act(() => result.current.disconnect());
    expect(stopPublishing).toHaveBeenCalledTimes(1);
  });

  it("captures a LivestreamError thrown by publishLivestream", async ({ renderHook }) => {
    const err = Object.values(LivestreamError)[0];
    // Reject only the real connect call; resolve any teardown-time stray call so
    // it doesn't surface as an unhandled rejection.
    vi.mocked(publishLivestream)
      .mockRejectedValueOnce(err)
      .mockResolvedValue({ stopPublishing: vi.fn() } as never);

    const { result } = renderHook(() => useLivestreamStreamer());
    await act(async () => {
      await result.current.connect({ inputs: { video: createFakeStream([{ kind: "video" }]) }, token: "t" });
    });

    expect(result.current.error).toBe(err);
  });
});

describe("useLivestreamViewer", () => {
  beforeEach(() => vi.mocked(receiveLivestream).mockClear());

  it("connects, exposes the received stream and disconnects", async ({ renderHook }) => {
    const stream = createFakeStream([{ kind: "video" }]);
    const stop = vi.fn();
    vi.mocked(receiveLivestream).mockResolvedValue({
      stream,
      stop,
      getStatistics: async () => ({}) as RTCStatsReport,
    } as never);

    const { result } = renderHook(() => useLivestreamViewer());

    await act(async () => {
      await result.current.connect({ token: "viewer-token" });
    });

    expect(receiveLivestream).toHaveBeenCalledTimes(1);
    expect(result.current.stream).toBe(stream);

    act(() => result.current.disconnect());
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.stream).toBeNull();
  });
});
