import { act } from "@testing-library/react";

import { useVAD } from "../hooks/useVAD";
import type { PeerId } from "../types/public";
import { createFakeTrack } from "./support/fakeMediaStream";
import { describe, expect, it } from "./support/fixtures";

const micMeta = { type: "microphone", paused: false } as const;

describe("useVAD (remote peers)", () => {
  it("reports false until a peer starts speaking", ({ client, renderHook }) => {
    const { result } = renderHook(() => useVAD({ peerIds: ["p1" as PeerId] }));

    act(() => {
      client.addRemotePeer({
        id: "p1",
        tracks: [{ trackId: "mic", metadata: micMeta, track: createFakeTrack({ kind: "audio" }) }],
      });
      client.notifyStateChanged();
    });

    expect(result.current["p1" as PeerId]).toBe(false);
  });

  it("flips to true on a voiceActivityChanged → speech event", ({ client, renderHook }) => {
    const { result } = renderHook(() => useVAD({ peerIds: ["p1" as PeerId] }));

    act(() => {
      client.addRemotePeer({
        id: "p1",
        tracks: [{ trackId: "mic", metadata: micMeta, track: createFakeTrack({ kind: "audio" }) }],
      });
      client.notifyStateChanged();
    });

    act(() => client.getRemoteTrackContext("p1", "mic")!.simulateVad("speech"));
    expect(result.current["p1" as PeerId]).toBe(true);

    act(() => client.getRemoteTrackContext("p1", "mic")!.simulateVad("silence"));
    expect(result.current["p1" as PeerId]).toBe(false);
  });

  it("only tracks the requested peer ids", ({ client, renderHook }) => {
    const { result } = renderHook(() => useVAD({ peerIds: ["p1" as PeerId] }));

    act(() => {
      client.addRemotePeer({
        id: "p2",
        tracks: [{ trackId: "mic2", metadata: micMeta, track: createFakeTrack({ kind: "audio" }) }],
      });
      client.notifyStateChanged();
    });

    expect(result.current["p2" as PeerId]).toBeUndefined();
  });
});
