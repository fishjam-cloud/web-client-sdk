import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useVAD } from "../hooks/useVAD";
import type { PeerId } from "../types/public";
import { FakeFishjamClient } from "./support/fakeFishjamClient";
import { createFakeTrack } from "./support/fakeMediaStream";
import { renderHookWithProvider } from "./support/renderWithProvider";

const micMeta = { type: "microphone", paused: false } as const;

describe("useVAD (remote peers)", () => {
  it("reports false until a peer starts speaking", () => {
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useVAD({ peerIds: ["p1" as PeerId] }), { client });

    act(() => {
      client.addRemotePeer({
        id: "p1",
        tracks: [{ trackId: "mic", metadata: micMeta, track: createFakeTrack({ kind: "audio" }) }],
      });
      client.notifyStateChanged();
    });

    expect(result.current["p1" as PeerId]).toBe(false);
  });

  it("flips to true on a voiceActivityChanged → speech event", () => {
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useVAD({ peerIds: ["p1" as PeerId] }), { client });

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

  it("only tracks the requested peer ids", () => {
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useVAD({ peerIds: ["p1" as PeerId] }), { client });

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
