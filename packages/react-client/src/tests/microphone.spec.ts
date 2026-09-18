import { act } from "@testing-library/react";

import { useMicrophone } from "../hooks/devices/useMicrophone";
import { usePeers } from "../hooks/usePeers";
import { Deferred } from "../utils/deferred";
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

  for (const muted of [true, false]) {
    it(`preserves ${muted ? "mute" : "unmute"} applied while switching microphones`, async ({
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
      if (!muted) {
        await act(async () => {
          await result.current.mic.toggleMicrophoneMute();
        });
      }

      const previousTrack = result.current.mic.microphoneStream!.getAudioTracks()[0];
      const acquisitionStarted = new Deferred<void>();
      const acquisition = new Deferred<MediaStream>();
      media.devices.getUserMedia.mockImplementationOnce(() => {
        acquisitionStarted.resolve();
        return acquisition.promise;
      });

      let selection: ReturnType<typeof result.current.mic.selectMicrophone>;
      await act(async () => {
        selection = result.current.mic.selectMicrophone("mic-2");
        await acquisitionStarted.promise;
      });

      const replacement = createFakeStream([{ kind: "audio", deviceId: "mic-2" }]);
      // Resolve acquisition in the same React batch as the mute change: the
      // pending operation must observe the intent without waiting for a render.
      await act(async () => {
        await result.current.mic.toggleMicrophoneMute();
        acquisition.resolve(replacement);
        await selection;
      });

      const replacementTrack = replacement.getAudioTracks()[0];
      expect(previousTrack.readyState).toBe("ended");
      expect(result.current.mic.isMicrophoneOn).toBe(true);
      expect(result.current.mic.isMicrophoneMuted).toBe(muted);
      expect(result.current.mic.microphoneStream?.getAudioTracks()[0]).toBe(replacementTrack);
      expect(replacementTrack.enabled).toBe(!muted);
      const published = result.current.peers.localPeer?.microphoneTrack;
      expect(published?.track).toBe(replacementTrack);
      expect(published?.track?.enabled).toBe(!muted);
      expect(published?.metadata).toMatchObject({ type: "microphone", paused: muted });
    });
  }
});
