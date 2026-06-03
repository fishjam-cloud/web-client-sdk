import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMicrophone } from "../hooks/devices/useMicrophone";
import { FakeFishjamClient } from "./support/fakeFishjamClient";
import { createFakeStream } from "./support/fakeMediaStream";
import { renderHookWithProvider } from "./support/renderWithProvider";
import { media } from "./support/setup";

const audioStream = () => createFakeStream([{ kind: "audio", deviceId: "mic-1" }]);

describe("useMicrophone", () => {
  it("starts off and unmuted", () => {
    const { result } = renderHookWithProvider(() => useMicrophone());
    expect(result.current.isMicrophoneOn).toBe(false);
    expect(result.current.isMicrophoneMuted).toBe(false);
  });

  it("startMicrophone acquires an audio stream", async () => {
    media().setUserMediaStream(audioStream());
    const { result } = renderHookWithProvider(() => useMicrophone());

    await act(async () => {
      await result.current.startMicrophone();
    });

    expect(result.current.isMicrophoneOn).toBe(true);
    expect(result.current.microphoneStream?.getAudioTracks()).toHaveLength(1);
  });

  it("toggleMicrophoneMute pauses the track and reports muted, keeping the device on", async () => {
    media().setUserMediaStream(audioStream());
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useMicrophone(), { client });

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.toggleMicrophone(); // device on + publish
    });
    expect(client.addTrack).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.toggleMicrophoneMute();
    });

    expect(result.current.isMicrophoneMuted).toBe(true);
    // Still on (soft mute): the stream is not torn down.
    expect(result.current.isMicrophoneOn).toBe(true);
    expect(client.replaceTrack).toHaveBeenCalledWith(expect.any(String), null);
    expect(client.updateTrackMetadata.mock.calls.at(-1)?.[1]).toMatchObject({ type: "microphone", paused: true });
  });

  it("unmuting resumes the track", async () => {
    media().setUserMediaStream(audioStream());
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useMicrophone(), { client });

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.toggleMicrophone();
    });
    await act(async () => {
      await result.current.toggleMicrophoneMute(); // mute
    });
    await act(async () => {
      await result.current.toggleMicrophoneMute(); // unmute
    });

    expect(result.current.isMicrophoneMuted).toBe(false);
    expect(client.updateTrackMetadata.mock.calls.at(-1)?.[1]).toMatchObject({ type: "microphone", paused: false });
  });
});
