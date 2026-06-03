import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useScreenShare } from "../hooks/useScreenShare";
import { FakeFishjamClient } from "./support/fakeFishjamClient";
import { createFakeStream } from "./support/fakeMediaStream";
import { renderHookWithProvider } from "./support/renderWithProvider";
import { media } from "./support/setup";

const screenStream = () =>
  createFakeStream([
    { kind: "video", deviceId: "screen" },
    { kind: "audio", deviceId: "tab" },
  ]);

describe("useScreenShare", () => {
  it("has no stream initially", () => {
    const { result } = renderHookWithProvider(() => useScreenShare());
    expect(result.current.stream).toBeNull();
    expect(result.current.videoTrack).toBeNull();
    expect(result.current.audioTrack).toBeNull();
  });

  it("startStreaming prompts getDisplayMedia and publishes video + audio tracks", async () => {
    media().setDisplayMediaStream(screenStream());
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useScreenShare(), { client });

    await act(async () => {
      await result.current.startStreaming();
    });

    expect(media().devices.getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(result.current.videoTrack).not.toBeNull();
    expect(result.current.audioTrack).not.toBeNull();

    const metas = client.addTrack.mock.calls.map((c) => (c[1] as { type: string }).type);
    expect(metas).toContain("screenShareVideo");
    expect(metas).toContain("screenShareAudio");
  });

  it("stopStreaming removes the SFU tracks while connected and clears the stream", async () => {
    media().setDisplayMediaStream(screenStream());
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useScreenShare(), { client });

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

  it("setTracksMiddleware processes both tracks and replaces them on the SFU", async () => {
    media().setDisplayMediaStream(screenStream());
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useScreenShare(), { client });

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

    // KNOWN QUIRK (FCE-XXXX): setTracksMiddleware never writes the middleware
    // back into state, so `currentTracksMiddleware` stays null and the middleware
    // is NOT re-applied on a subsequent startStreaming. Captured here so the
    // rewrite has to make a deliberate decision to fix it (the assertion will
    // flip when it does). See REWRITE_PLAN.md §5.
    expect(result.current.currentTracksMiddleware).toBeNull();
  });
});
