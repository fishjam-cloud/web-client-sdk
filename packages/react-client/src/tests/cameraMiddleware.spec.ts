import { act } from "@testing-library/react";

import { useCamera } from "../hooks/devices/useCamera";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it, vi } from "./support/fixtures";

const videoStream = () => createFakeStream([{ kind: "video", deviceId: "cam-1" }]);

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

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

  it("releases the previous middleware only after the published track was swapped", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(videoStream());
    const first = createTrackingMiddleware();
    const second = createTrackingMiddleware();
    const { result } = renderHook(() => useCamera());

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.toggleCamera();
    });
    await act(async () => {
      await result.current.setCameraTrackMiddleware(first.middleware);
    });

    const callOrder: string[] = [];
    client.replaceTrack.mockImplementationOnce(async () => {
      callOrder.push("replaceTrack");
    });
    first.onClear.mockImplementation(() => {
      callOrder.push("onClear");
    });

    await act(async () => {
      await result.current.setCameraTrackMiddleware(second.middleware);
    });

    expect(callOrder).toEqual(["replaceTrack", "onClear"]);
    expect(first.onClear).toHaveBeenCalledTimes(1);
    expect(second.onClear).not.toHaveBeenCalled();
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
