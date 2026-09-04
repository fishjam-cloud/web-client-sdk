import { act } from "@testing-library/react";

import { useCamera } from "../hooks/devices/useCamera";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it, vi } from "./support/fixtures";

const videoStream = () => createFakeStream([{ kind: "video", deviceId: "cam-1" }]);

/** Lets the re-apply effect's promise settle after a device track changes. */
const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * A middleware that hands back a distinct track per raw track, so a test can tell which raw track
 * it ran against — and whether it ran at all.
 */
const createTrackingMiddleware = () => {
  const onClear = vi.fn();
  const processedFor = new Map<MediaStreamTrack, MediaStreamTrack>();
  const middleware = (track: MediaStreamTrack) => {
    const processed = createFakeStream([{ kind: "video", deviceId: "processed" }]).getVideoTracks()[0];
    processedFor.set(track, processed);
    return { track: processed, onClear };
  };
  return { middleware, onClear, processedFor, callCount: () => processedFor.size };
};

/** A middleware whose setup only completes when the test says so, like one that loads a model. */
const createDeferredMiddleware = (deviceId: string) => {
  const onClear = vi.fn();
  let processed: MediaStreamTrack | null = null;
  let finish = () => {};
  const middleware = (_track: MediaStreamTrack) =>
    new Promise<{ track: MediaStreamTrack; onClear: () => void }>((resolve) => {
      finish = () => {
        processed = createFakeStream([{ kind: "video", deviceId }]).getVideoTracks()[0];
        resolve({ track: processed, onClear });
      };
    });
  return { middleware, onClear, finish: () => finish(), processedTrack: () => processed };
};

describe("camera track middleware", () => {
  it("applies to a camera started after the middleware was set", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { middleware, callCount } = createTrackingMiddleware();
    const { result } = renderHook(() => useCamera());

    // The usual order for a hook: the effect is declared before the camera exists.
    await act(async () => {
      await result.current.setCameraTrackMiddleware(middleware);
    });
    expect(callCount()).toBe(0);

    await act(async () => {
      await result.current.startCamera();
    });
    await flushEffects();

    expect(callCount()).toBe(1);
    expect(result.current.cameraStream?.getVideoTracks()[0].getSettings().deviceId).toBe("processed");
  });

  it("re-applies after the camera is stopped and started again", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { middleware, callCount } = createTrackingMiddleware();
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });
    await act(async () => {
      await result.current.setCameraTrackMiddleware(middleware);
    });
    expect(callCount()).toBe(1);

    act(() => result.current.stopCamera());
    await act(async () => {
      await result.current.startCamera();
    });
    await flushEffects();

    expect(callCount()).toBe(2);
    expect(result.current.cameraStream?.getVideoTracks()[0].getSettings().deviceId).toBe("processed");
  });

  it("runs onClear exactly once when the device is stopped", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { middleware, onClear } = createTrackingMiddleware();
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });
    await act(async () => {
      await result.current.setCameraTrackMiddleware(middleware);
    });

    act(() => result.current.stopCamera());
    await flushEffects();

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("runs onClear exactly once when the device stops and the middleware is then cleared", async ({
    media,
    renderHook,
  }) => {
    media.setUserMediaStream(videoStream());
    const { middleware, onClear } = createTrackingMiddleware();
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });
    await act(async () => {
      await result.current.setCameraTrackMiddleware(middleware);
    });

    act(() => result.current.stopCamera());
    await act(async () => {
      await result.current.setCameraTrackMiddleware(null);
    });
    await flushEffects();

    // Both paths release the same session; running a consumer's teardown twice would free
    // resources it no longer owns.
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("publishes the processed track, never the raw one, when the camera is turned on while connected", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(videoStream());
    const { middleware } = createTrackingMiddleware();
    const { result } = renderHook(() => useCamera());

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.setCameraTrackMiddleware(middleware);
    });

    await act(async () => {
      await result.current.toggleCamera();
    });
    await flushEffects();

    expect(client.addTrack).toHaveBeenCalledTimes(1);
    const publishedTrack = client.addTrack.mock.calls[0][0] as MediaStreamTrack;
    expect(publishedTrack.getSettings().deviceId).toBe("processed");
  });

  it("releases a middleware that finishes setting up after it was replaced", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const slow = createDeferredMiddleware("slow");
    const { middleware: fast, onClear: fastOnClear } = createTrackingMiddleware();
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    await act(async () => {
      const slowApply = result.current.setCameraTrackMiddleware(slow.middleware);
      await result.current.setCameraTrackMiddleware(fast);
      slow.finish();
      await slowApply;
    });

    // The slow one never became the live track, so it must clean up after itself and leave the
    // replacement untouched.
    expect(slow.onClear).toHaveBeenCalledTimes(1);
    expect(slow.processedTrack()?.readyState).toBe("ended");
    expect(fastOnClear).not.toHaveBeenCalled();
    expect(result.current.cameraStream?.getVideoTracks()[0].getSettings().deviceId).toBe("processed");
  });

  it("releases a middleware that finishes setting up after it was cleared", async ({ media, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const slow = createDeferredMiddleware("slow");
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    await act(async () => {
      const slowApply = result.current.setCameraTrackMiddleware(slow.middleware);
      await result.current.setCameraTrackMiddleware(null);
      slow.finish();
      await slowApply;
    });

    expect(slow.onClear).toHaveBeenCalledTimes(1);
    expect(result.current.cameraStream?.getVideoTracks()[0].getSettings().deviceId).toBe("cam-1");
  });
});
