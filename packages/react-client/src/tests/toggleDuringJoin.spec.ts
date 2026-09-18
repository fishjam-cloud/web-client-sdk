import { act } from "@testing-library/react";

import { useCamera } from "../hooks/devices/useCamera";
import { useMicrophone } from "../hooks/devices/useMicrophone";
import { usePeers } from "../hooks/usePeers";
import { Deferred } from "../utils/deferred";
import type { MediaDevicesController } from "./support/fakeMediaDevices";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";

const holdNextUserMedia = (media: MediaDevicesController, kind: "audio" | "video") => {
  const acquisition = new Deferred<MediaStream>();
  media.devices.getUserMedia.mockImplementationOnce(() => acquisition.promise);
  const stream = createFakeStream([{ kind, deviceId: `${kind}-1` }]);
  return { release: () => acquisition.resolve(stream), track: stream.getTracks()[0] };
};

const publishedKinds = (calls: unknown[][]) => calls.map(([track]) => (track as MediaStreamTrack).kind);

describe("toggling a device while joining", () => {
  it("publishes the microphone when joined fires before the device has started", async ({
    media,
    client,
    renderHook,
  }) => {
    const { result } = renderHook(() => ({ mic: useMicrophone(), peers: usePeers() }));
    const acquisition = holdNextUserMedia(media, "audio");

    act(() => client.simulateConnectionStarted());
    let toggle: Promise<unknown>;
    act(() => {
      toggle = result.current.mic.toggleMicrophone();
    });
    act(() => client.simulateJoined());
    await act(async () => {
      acquisition.release();
      await toggle;
    });

    expect(result.current.mic.isMicrophoneOn).toBe(true);
    expect(publishedKinds(client.addTrack.mock.calls)).toEqual(["audio"]);
    expect(result.current.peers.localPeer?.microphoneTrack?.track).toBe(acquisition.track);
  });

  it("publishes the camera when joined fires before the device has started", async ({ media, client, renderHook }) => {
    const { result } = renderHook(() => ({ cam: useCamera(), peers: usePeers() }));
    const acquisition = holdNextUserMedia(media, "video");

    act(() => client.simulateConnectionStarted());
    let toggle: Promise<unknown>;
    act(() => {
      toggle = result.current.cam.toggleCamera();
    });
    act(() => client.simulateJoined());
    await act(async () => {
      acquisition.release();
      await toggle;
    });

    expect(result.current.cam.isCameraOn).toBe(true);
    expect(publishedKinds(client.addTrack.mock.calls)).toEqual(["video"]);
    expect(result.current.peers.localPeer?.cameraTrack?.track).toBe(acquisition.track);
  });

  it("publishes the microphone when toggled in the same tick as joined", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(createFakeStream([{ kind: "audio", deviceId: "audio-1" }]));
    const { result } = renderHook(() => useMicrophone());

    act(() => client.simulateConnectionStarted());
    await act(async () => {
      client.simulateJoined();
      await result.current.toggleMicrophone();
    });

    expect(publishedKinds(client.addTrack.mock.calls)).toEqual(["audio"]);
  });

  it("publishes the microphone once when the device starts before joined", async ({ media, client, renderHook }) => {
    const { result } = renderHook(() => useMicrophone());
    const acquisition = holdNextUserMedia(media, "audio");

    act(() => client.simulateConnectionStarted());
    await act(async () => {
      const toggle = result.current.toggleMicrophone();
      acquisition.release();
      await toggle;
    });
    act(() => client.simulateJoined());

    expect(publishedKinds(client.addTrack.mock.calls)).toEqual(["audio"]);
  });

  it("does not publish a device toggled on before joining when the join never completes", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(createFakeStream([{ kind: "audio", deviceId: "audio-1" }]));
    const { result } = renderHook(() => useMicrophone());

    act(() => client.simulateConnectionStarted());
    await act(async () => {
      await result.current.toggleMicrophone();
    });

    expect(result.current.isMicrophoneOn).toBe(true);
    expect(client.addTrack).not.toHaveBeenCalled();
  });

  it("publishes the microphone when toggled after joining", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(createFakeStream([{ kind: "audio", deviceId: "audio-1" }]));
    const { result } = renderHook(() => useMicrophone());

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.toggleMicrophone();
    });

    expect(publishedKinds(client.addTrack.mock.calls)).toEqual(["audio"]);
  });
});
