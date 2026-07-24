import { act } from "@testing-library/react";

import { usePeers } from "../hooks/usePeers";
import { useScreenShare } from "../hooks/useScreenShare";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";

const screenStream = () =>
  createFakeStream([
    { kind: "video", deviceId: "screen" },
    { kind: "audio", deviceId: "tab" },
  ]);

describe("useScreenShare", () => {
  it("has no stream initially", ({ renderHook }) => {
    const { result } = renderHook(() => useScreenShare());
    expect(result.current.stream).toBeNull();
    expect(result.current.videoTrack).toBeNull();
    expect(result.current.audioTrack).toBeNull();
  });

  it("startStreaming prompts getDisplayMedia and publishes video + audio tracks", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setDisplayMediaStream(screenStream());
    const { result } = renderHook(() => useScreenShare());

    // Publishing to the SFU only happens once connected (status "initialized").
    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.startStreaming();
    });

    expect(media.devices.getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(result.current.videoTrack).not.toBeNull();
    expect(result.current.audioTrack).not.toBeNull();

    const metas = client.addTrack.mock.calls.map((c) => (c[1] as { type: string }).type);
    expect(metas).toContain("screenShareVideo");
    expect(metas).toContain("screenShareAudio");
  });

  it("stopStreaming removes the SFU tracks while connected and clears the stream", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setDisplayMediaStream(screenStream());
    const { result } = renderHook(() => useScreenShare());

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.startStreaming();
    });
    await act(async () => {
      await result.current.stopStreaming();
    });

    expect(client.removeTrack).toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
  });

  it("publishes only the audio track when an audio-only room refuses the video track", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setDisplayMediaStream(screenStream());
    client.simulateAudioOnlyRoom();
    const { result } = renderHook(() => ({ screenShare: useScreenShare(), peers: usePeers() }));

    act(() => client.simulateJoined());
    // addTrack throws TrackTypeError for the video track; startStreaming must
    // recover and still publish the audio track instead of rejecting.
    await act(async () => {
      await result.current.screenShare.startStreaming();
    });

    expect(result.current.screenShare.stream).not.toBeNull();
    expect(result.current.screenShare.videoTrack).not.toBeNull(); // still captured locally
    expect(result.current.peers.localPeer?.screenShareVideoTrack).toBeUndefined();
    expect(result.current.peers.localPeer?.screenShareAudioTrack).toBeDefined();
  });

  it("setTracksMiddleware processes both tracks and replaces them on the SFU", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setDisplayMediaStream(screenStream());
    const { result } = renderHook(() => useScreenShare());

    // replaceTrack is only reached when tracks were published (status
    // "initialized"), which requires being connected.
    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.startStreaming();
    });

    const processedVideo = createFakeStream([{ kind: "video", deviceId: "pv" }]).getVideoTracks()[0];
    await act(async () => {
      await result.current.setTracksMiddleware((video, audio) => ({
        videoTrack: processedVideo,
        audioTrack: audio ?? video,
        onClear: () => {},
      }));
    });

    // The middleware output is pushed to the SFU via replaceTrack.
    expect(client.replaceTrack).toHaveBeenCalled();

    // KNOWN QUIRK (FCE-3574): setTracksMiddleware never writes the middleware
    // back into state, so `currentTracksMiddleware` stays null and the middleware
    // is NOT re-applied on a subsequent startStreaming. Captured here so the
    // rewrite has to make a deliberate decision to fix it (the assertion will
    // flip when it does).
    expect(result.current.currentTracksMiddleware).toBeNull();
  });
});
