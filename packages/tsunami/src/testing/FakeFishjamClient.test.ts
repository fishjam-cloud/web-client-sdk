import { TrackTypeError } from "@fishjam-cloud/ts-client";
import { describe, expect, it, vi } from "vitest";

import { FakeFishjamClient } from "./FakeFishjamClient";
import { createFakeTrack } from "./FakeMediaStream";

describe("FakeFishjamClient", () => {
  it("models connect as new -> initialized and settles only after joined", async () => {
    const client = new FakeFishjamClient();
    const joined = vi.fn();
    client.on("joined", joined);
    let settled = false;

    expect(client.status).toBe("new");
    const connecting = client
      .connect({ token: "token", url: "ws://fishjam.test", peerMetadata: undefined })
      .then(() => {
        settled = true;
      });

    expect(client.status).toBe("initialized");
    await Promise.resolve();
    expect(settled).toBe(false);

    client.simulateJoined();
    await connecting;
    expect(settled).toBe(true);
    expect(joined).toHaveBeenCalledWith("local-peer", [], []);
  });

  it.each([
    ["authentication", (client: FakeFishjamClient) => client.simulateAuthError()],
    ["join", (client: FakeFishjamClient) => client.simulateJoinError()],
    ["socket", (client: FakeFishjamClient) => client.simulateSocketError()],
  ])("rejects a pending connect on %s errors", async (_label, fail) => {
    const client = new FakeFishjamClient();
    const connecting = client.connect({ token: "token", url: "ws://fishjam.test", peerMetadata: undefined });

    fail(client);

    await expect(connecting).rejects.toThrow(/connect\(\) was pending/);
  });

  it("updates its local peer and emits the real local-track event payloads", async () => {
    const client = new FakeFishjamClient();
    const added = vi.fn();
    const replaced = vi.fn();
    const metadataChanged = vi.fn();
    const removed = vi.fn();
    client.on("localTrackAdded", added);
    client.on("localTrackReplaced", replaced);
    client.on("localTrackMetadataChanged", metadataChanged);
    client.on("localTrackRemoved", removed);
    const originalTrack = createFakeTrack({ kind: "video" });

    const trackId = await client.addTrack(originalTrack, { type: "camera", paused: false });
    const stream = client.getLocalPeer()?.tracks.get(trackId)?.stream;
    const replacement = createFakeTrack({ kind: "video" });
    await client.replaceTrack(trackId, replacement);
    expect(stream?.getTracks()).toEqual([replacement]);
    client.updateTrackMetadata(trackId, { type: "screenShareVideo", paused: false });
    await client.removeTrack(trackId);

    expect(added).toHaveBeenCalledWith(expect.objectContaining({ trackId, track: originalTrack }));
    expect(replaced).toHaveBeenCalledWith({ trackId, track: replacement });
    expect(metadataChanged).toHaveBeenCalledWith({
      trackId,
      metadata: { type: "screenShareVideo", paused: false },
    });
    expect(removed).toHaveBeenCalledWith({ trackId });
    expect(stream?.getTracks()).toEqual([]);
    expect(client.getLocalPeer()?.tracks.has(trackId)).toBe(false);
  });

  it("throws TrackTypeError synchronously for video in an audio-only room", () => {
    const client = new FakeFishjamClient();
    client.simulateAudioOnlyRoom();

    expect(() => client.addTrack(createFakeTrack({ kind: "video" }))).toThrow(TrackTypeError);
  });

  it("preserves custom peer and server metadata types", () => {
    type PeerMetadata = { displayName: string };
    type ServerMetadata = { role: "host" | "guest" };
    const client = new FakeFishjamClient<PeerMetadata, ServerMetadata>();

    client.setLocalPeer({
      id: "local-peer",
      metadata: { peer: { displayName: "Ada" }, server: { role: "host" } },
    });
    client.updatePeerMetadata({ displayName: "Grace" });

    expect(client.asClient().getLocalPeer()?.metadata).toEqual({
      peer: { displayName: "Grace" },
      server: { role: "host" },
    });
  });
});
