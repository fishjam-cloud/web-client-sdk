import { act } from "@testing-library/react";

import { useMicrophone } from "../hooks/devices/useMicrophone";
import { usePeers } from "../hooks/usePeers";
import { createFakeStream } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";

const audioStream = () => createFakeStream([{ kind: "audio", deviceId: "mic-1" }]);

describe("useMicrophone", () => {
  it("starts off and unmuted", ({ renderHook }) => {
    const { result } = renderHook(() => useMicrophone());
    expect(result.current.isMicrophoneOn).toBe(false);
    expect(result.current.isMicrophoneMuted).toBe(false);
  });

  it("startMicrophone acquires an audio stream", async ({ media, renderHook }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => useMicrophone());

    await act(async () => {
      await result.current.startMicrophone();
    });

    expect(result.current.isMicrophoneOn).toBe(true);
    expect(result.current.microphoneStream?.getAudioTracks()).toHaveLength(1);
  });

  it("toggleMicrophoneMute pauses the track and reports muted, keeping the device on", async ({
    media,
    client,
    renderHook,
  }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => ({ mic: useMicrophone(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.mic.toggleMicrophone(); // device on + publish
    });
    expect(client.addTrack).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.mic.toggleMicrophoneMute();
    });

    expect(result.current.mic.isMicrophoneMuted).toBe(true);
    // Still on (soft mute): the stream is not torn down.
    expect(result.current.mic.isMicrophoneOn).toBe(true);
    // Peers see a paused microphone track with no media flowing.
    const published = result.current.peers.localPeer?.microphoneTrack;
    expect(published?.track).toBeNull();
    expect(published?.metadata).toMatchObject({ type: "microphone", paused: true });
  });

  it("unmuting resumes the track", async ({ media, client, renderHook }) => {
    media.setUserMediaStream(audioStream());
    const { result } = renderHook(() => ({ mic: useMicrophone(), peers: usePeers() }));

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.mic.toggleMicrophone();
    });
    await act(async () => {
      await result.current.mic.toggleMicrophoneMute(); // mute
    });
    await act(async () => {
      await result.current.mic.toggleMicrophoneMute(); // unmute
    });

    expect(result.current.mic.isMicrophoneMuted).toBe(false);
    // Media flows again and the metadata no longer reports paused.
    const published = result.current.peers.localPeer?.microphoneTrack;
    expect(published?.track).not.toBeNull();
    expect(published?.metadata).toMatchObject({ type: "microphone", paused: false });
  });
});
