import type { Component, FishjamClient as TsClient, GenericMetadata, Peer } from "@fishjam-cloud/ts-client";
import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";

import { FishjamClient } from "./FishjamClient";

class FakeSignallingClient extends EventEmitter {
  public localPeer: Peer<GenericMetadata, GenericMetadata> | null = null;
  public remotePeers: Record<string, Peer<GenericMetadata, GenericMetadata>> = {};
  public components: Record<string, Component> = {};

  public getLocalPeer = () => this.localPeer;
  public getRemotePeers = () => this.remotePeers;
  public getRemoteComponents = () => this.components;
  public connect = vi.fn(async () => {});
  public disconnect = vi.fn();
  public cleanup = vi.fn();
}

const createWiredClient = () => {
  const signalling = new FakeSignallingClient();
  const client = new FishjamClient({
    signallingClient: signalling as unknown as TsClient<GenericMetadata, GenericMetadata>,
  });
  return { signalling, client };
};

const buildPeer = (id: string): Peer<GenericMetadata, GenericMetadata> => ({
  id,
  type: "webrtc",
  tracks: new Map(),
});

describe("FishjamClient session state", () => {
  it("starts idle with no participants", () => {
    const { client } = createWiredClient();

    expect(client.getState()).toMatchObject({
      peerStatus: "idle",
      reconnectionStatus: "idle",
      localPeer: null,
      remotePeers: {},
      components: {},
    });
  });

  it("mirrors the connection lifecycle into peerStatus", () => {
    const { signalling, client } = createWiredClient();

    signalling.emit("connectionStarted");
    expect(client.getState().peerStatus).toBe("connecting");

    signalling.emit("joined", "local-peer", [], []);
    expect(client.getState().peerStatus).toBe("connected");

    signalling.emit("disconnected");
    expect(client.getState().peerStatus).toBe("idle");
  });

  it("sets peerStatus to error on auth, join and connection errors", () => {
    const { signalling, client } = createWiredClient();

    for (const errorEvent of ["authError", "joinError", "connectionError"] as const) {
      signalling.emit("disconnected");
      signalling.emit(errorEvent);
      expect(client.getState().peerStatus).toBe("error");
    }
  });

  it("tracks reconnectionStatus across the reconnect lifecycle", () => {
    const { signalling, client } = createWiredClient();

    signalling.emit("reconnectionStarted");
    expect(client.getState().reconnectionStatus).toBe("reconnecting");

    signalling.emit("reconnected");
    expect(client.getState().reconnectionStatus).toBe("idle");

    signalling.emit("reconnectionStarted");
    signalling.emit("reconnectionRetriesLimitReached");
    expect(client.getState().reconnectionStatus).toBe("error");
  });

  it("promotes auth and join errors to reconnection errors only while reconnecting", () => {
    const { signalling, client } = createWiredClient();

    signalling.emit("joinError");
    expect(client.getState().reconnectionStatus).toBe("idle");

    signalling.emit("reconnectionStarted");
    signalling.emit("authError");
    expect(client.getState().reconnectionStatus).toBe("error");
  });

  it("re-reads participants from the signalling client on participant events", () => {
    const { signalling, client } = createWiredClient();

    signalling.localPeer = buildPeer("local");
    signalling.remotePeers = { remote: buildPeer("remote") };
    signalling.emit("peerJoined", signalling.remotePeers["remote"]);

    expect(client.getState().localPeer?.id).toBe("local");
    expect(Object.keys(client.getState().remotePeers)).toEqual(["remote"]);
  });

  it("produces fresh participant references even when the signalling client mutates in place", () => {
    const { signalling, client } = createWiredClient();
    signalling.localPeer = buildPeer("local");
    signalling.emit("peerJoined", buildPeer("remote"));
    const localPeerBefore = client.getState().localPeer;

    // The signalling client mutates the same peer object; the mirror must
    // still expose the change as a new reference.
    signalling.emit("localTrackAdded");

    expect(client.getState().localPeer).not.toBe(localPeerBefore);
  });

  it("notifies subscribers synchronously on state changes", () => {
    const { signalling, client } = createWiredClient();
    const observedStatuses: string[] = [];
    client.subscribe(() => {
      observedStatuses.push(client.getState().peerStatus);
    });

    signalling.emit("connectionStarted");
    signalling.emit("joined", "local-peer", [], []);

    expect(observedStatuses).toEqual(["connecting", "connected"]);
  });

  it("supports slice subscriptions on the client", () => {
    const { signalling, client } = createWiredClient();
    const sliceListener = vi.fn();
    client.subscribeToSlice((state) => state.peerStatus, sliceListener);

    signalling.emit("connectionStarted");
    signalling.emit("reconnectionStarted");

    expect(sliceListener).toHaveBeenCalledTimes(1);
    expect(sliceListener).toHaveBeenCalledWith("connecting", "idle");
  });

  it("stops mirroring after dispose", () => {
    const { signalling, client } = createWiredClient();
    const listener = vi.fn();
    client.subscribe(listener);

    client.dispose();
    signalling.emit("connectionStarted");

    expect(listener).not.toHaveBeenCalled();
    expect(client.getState().peerStatus).toBe("idle");
  });
});
