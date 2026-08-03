import { connectAndJoin, describe, expect, it } from "./support/fixtures";

describe("connection state", () => {
  it("starts idle", ({ service }) => {
    expect(service.state().peerStatus).toBe("idle");
    expect(service.state().reconnectionStatus).toBe("idle");
  });

  it("passes url, token and peer metadata to the signalling client", async ({ service, signalling }) => {
    const connecting = service.client.connect({
      url: "wss://fishjam.example/socket",
      token: "token-123",
      peerMetadata: { displayName: "alice" },
    });
    signalling.simulateJoined();
    await connecting;

    expect(signalling.connect).toHaveBeenCalledTimes(1);
    expect(signalling.connect.mock.calls[0][0]).toMatchObject({
      url: "wss://fishjam.example/socket",
      token: "token-123",
      peerMetadata: { displayName: "alice" },
    });
  });

  it("mirrors idle → connecting → connected → idle into the state signal", async ({ service, signalling }) => {
    await connectAndJoin(service, signalling);
    expect(service.state().peerStatus).toBe("connected");

    service.client.disconnect();
    expect(signalling.disconnect).toHaveBeenCalledTimes(1);
    expect(service.state().peerStatus).toBe("idle");
  });

  it("rejects connect and reports error state when the join fails", async ({ service, signalling }) => {
    const connecting = service.client.connect({ url: "wss://fishjam.example/socket", token: "bad-token" });
    signalling.simulateJoinError();

    await expect(connecting).rejects.toThrow();
    expect(service.state().peerStatus).toBe("error");
  });

  it("sets peerStatus to error on auth, join and connection errors", ({ service, signalling }) => {
    // Each error source is handled independently; disconnect resets to idle
    // between them so every one is proven to flip peerStatus to "error".
    signalling.simulateAuthError();
    expect(service.state().peerStatus).toBe("error");

    signalling.simulateDisconnected();
    expect(service.state().peerStatus).toBe("idle");

    signalling.simulateJoinError();
    expect(service.state().peerStatus).toBe("error");

    signalling.simulateDisconnected();
    signalling.simulateConnectionError();
    expect(service.state().peerStatus).toBe("error");
  });

  it("tracks reconnectionStatus across the reconnect lifecycle", ({ service, signalling }) => {
    signalling.simulateReconnectionStarted();
    expect(service.state().reconnectionStatus).toBe("reconnecting");

    signalling.simulateReconnected();
    expect(service.state().reconnectionStatus).toBe("idle");
    expect(service.state().peerStatus).toBe("connected");

    signalling.simulateReconnectionStarted();
    signalling.simulateReconnectionRetriesLimitReached();
    expect(service.state().reconnectionStatus).toBe("error");
  });

  it("promotes a join error to a reconnection error only while reconnecting", ({ service, signalling }) => {
    signalling.simulateJoinError();
    expect(service.state().reconnectionStatus).toBe("idle");

    signalling.simulateReconnectionStarted();
    signalling.simulateJoinError();
    expect(service.state().reconnectionStatus).toBe("error");
  });
});
