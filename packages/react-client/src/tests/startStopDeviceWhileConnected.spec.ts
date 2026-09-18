import { act } from "@testing-library/react";

import { useCamera } from "../hooks/devices/useCamera";
import { useMicrophone } from "../hooks/devices/useMicrophone";
import { useConnection } from "../hooks/useConnection";
import { usePeers } from "../hooks/usePeers";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";

const audioStream = () => createFakeStream([{ kind: "audio", deviceId: "mic-1" }]);
const videoStream = () => createFakeStream([{ kind: "video", deviceId: "cam-1" }]);

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe("starting and stopping a device while connected", () => {
  it("startMicrophone publishes the microphone when already connected", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => ({ mic: useMicrophone(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.mic.startMicrophone();
    });

    const deviceTrack = result.current.mic.microphoneStream?.getAudioTracks()[0];
    expect(client.addTrack).toHaveBeenCalledTimes(1);
    expect(result.current.peers.localPeer?.microphoneTrack?.track).toBe(deviceTrack);
  });

  it("startCamera publishes the camera when already connected", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => ({ cam: useCamera(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.cam.startCamera();
    });

    const deviceTrack = result.current.cam.cameraStream?.getVideoTracks()[0];
    expect(client.addTrack).toHaveBeenCalledTimes(1);
    expect(result.current.peers.localPeer?.cameraTrack?.track).toBe(deviceTrack);
  });

  it("stopMicrophone pauses the published microphone", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => ({ mic: useMicrophone(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.mic.toggleMicrophone();
    });
    await act(async () => {
      result.current.mic.stopMicrophone();
    });
    await flushEffects();

    expect(result.current.mic.isMicrophoneOn).toBe(false);
    const published = result.current.peers.localPeer?.microphoneTrack;
    expect(published?.track).toBeNull();
    expect(published?.metadata).toMatchObject({ type: "microphone", paused: true });
  });

  it("startMicrophone after stopMicrophone republishes live audio on the same track", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => ({ mic: useMicrophone(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.mic.toggleMicrophone();
    });
    await act(async () => {
      result.current.mic.stopMicrophone();
    });
    await flushEffects();
    await act(async () => {
      await result.current.mic.startMicrophone();
    });

    const deviceTrack = result.current.mic.microphoneStream?.getAudioTracks()[0];
    const published = result.current.peers.localPeer?.microphoneTrack;
    expect(client.addTrack).toHaveBeenCalledTimes(1);
    expect(deviceTrack?.readyState).toBe("live");
    expect(published?.track).toBe(deviceTrack);
    expect(published?.metadata).toMatchObject({ type: "microphone", paused: false });
  });

  it("stopCamera then startCamera republishes the live camera", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const { result } = renderHook(() => ({ cam: useCamera(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.cam.toggleCamera();
    });
    await act(async () => {
      result.current.cam.stopCamera();
    });
    await flushEffects();
    expect(result.current.peers.localPeer?.cameraTrack?.metadata).toMatchObject({ paused: true });

    await act(async () => {
      await result.current.cam.startCamera();
    });

    const deviceTrack = result.current.cam.cameraStream?.getVideoTracks()[0];
    expect(client.addTrack).toHaveBeenCalledTimes(1);
    expect(result.current.peers.localPeer?.cameraTrack?.track).toBe(deviceTrack);
    expect(result.current.peers.localPeer?.cameraTrack?.metadata).toMatchObject({ paused: false });
  });

  it("startMicrophone twice while connected keeps one published track with the latest device track", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => ({ mic: useMicrophone(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.mic.startMicrophone();
    });
    await act(async () => {
      await result.current.mic.startMicrophone();
    });

    const deviceTrack = result.current.mic.microphoneStream?.getAudioTracks()[0];
    expect(client.addTrack).toHaveBeenCalledTimes(1);
    expect(result.current.peers.localPeer?.microphoneTrack?.track).toBe(deviceTrack);
  });

  it("startMicrophone before joining publishes once, on joined", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => useMicrophone());

    act(() => client.simulateConnectionStarted());
    await act(async () => {
      await result.current.startMicrophone();
    });
    expect(client.addTrack).not.toHaveBeenCalled();

    act(() => client.simulateJoined());

    expect(client.addTrack).toHaveBeenCalledTimes(1);
  });

  it("stopMicrophone and stopCamera after leaving send nothing to the room", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(
      createFakeStream([
        { kind: "audio", deviceId: "mic-1" },
        { kind: "video", deviceId: "cam-1" },
      ]),
    );
    const { result } = renderHook(() => ({ mic: useMicrophone(), cam: useCamera(), connection: useConnection() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.mic.toggleMicrophone();
      await result.current.cam.toggleCamera();
    });
    client.replaceTrack.mockClear();
    client.updateTrackMetadata.mockClear();

    await act(async () => {
      result.current.connection.leaveRoom();
      result.current.mic.stopMicrophone();
      result.current.cam.stopCamera();
    });
    await flushEffects();

    expect(result.current.mic.isMicrophoneOn).toBe(false);
    expect(result.current.cam.isCameraOn).toBe(false);
    expect(client.replaceTrack).not.toHaveBeenCalled();
    expect(client.updateTrackMetadata).not.toHaveBeenCalled();
  });

  it("stopMicrophone stops the device synchronously", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => useMicrophone());

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.toggleMicrophone();
    });
    const deviceTrack = result.current.microphoneStream?.getAudioTracks()[0];

    act(() => result.current.stopMicrophone());

    expect(deviceTrack?.readyState).toBe("ended");
    expect(result.current.isMicrophoneOn).toBe(false);
  });

  it("startCamera while connected publishes the middleware output", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(videoStream());
    const processed = createFakeStream([{ kind: "video", deviceId: "processed" }]).getVideoTracks()[0];
    let middlewareCalls = 0;
    const middleware = () => {
      middlewareCalls += 1;
      return { track: processed };
    };
    const { result } = renderHook(() => ({ cam: useCamera(), peers: usePeers() }));

    await act(async () => {
      await result.current.cam.setCameraTrackMiddleware(middleware);
    });
    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.cam.startCamera();
    });
    await flushEffects();

    expect(middlewareCalls).toBe(1);
    expect(client.addTrack).toHaveBeenCalledTimes(1);
    expect(result.current.peers.localPeer?.cameraTrack?.track).toBe(processed);
  });
});
