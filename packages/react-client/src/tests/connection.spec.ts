import { act } from "@testing-library/react";

import { useConnection } from "../hooks/useConnection";
import { describe, expect, it } from "./support/fixtures";

describe("useConnection", () => {
  it("starts idle", ({ renderHook }) => {
    const { result } = renderHook(() => useConnection());
    expect(result.current.peerStatus).toBe("idle");
    expect(result.current.reconnectionStatus).toBe("idle");
  });

  it("joinRoom connects the client with a ws url, token and metadata", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useConnection());

    await act(async () => {
      // connect() resolves only once joined fires (matching the real client).
      const joining = result.current.joinRoom({ peerToken: "tok-123", peerMetadata: { name: "alice" } });
      client.simulateJoined();
      await joining;
    });

    expect(client.connect).toHaveBeenCalledTimes(1);
    const config = client.connect.mock.calls[0][0] as { url: string; token: string; peerMetadata: unknown };
    expect(config.token).toBe("tok-123");
    expect(config.peerMetadata).toEqual({ name: "alice" });
    expect(config.url.startsWith("wss://")).toBe(true);
    expect(config.url).toContain("test-fishjam-id");
  });

  it("defaults peerMetadata to an empty object", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useConnection());
    await act(async () => {
      const joining = result.current.joinRoom({ peerToken: "tok" });
      client.simulateJoined();
      await joining;
    });
    expect((client.connect.mock.calls[0][0] as { peerMetadata: unknown }).peerMetadata).toEqual({});
  });

  it("transitions peerStatus connecting → connected on the client events", ({ client, renderHook }) => {
    const { result } = renderHook(() => useConnection());

    act(() => client.simulateConnectionStarted());
    expect(result.current.peerStatus).toBe("connecting");

    act(() => client.simulateJoined());
    expect(result.current.peerStatus).toBe("connected");
  });

  it("sets peerStatus to error on auth / join / connection errors", ({ client, renderHook }) => {
    const { result } = renderHook(() => useConnection());

    // Each error source is subscribed independently; disconnect resets to idle
    // between them so every one is proven to flip peerStatus to "error".
    act(() => client.simulateAuthError());
    expect(result.current.peerStatus).toBe("error");

    act(() => client.simulateDisconnected());
    expect(result.current.peerStatus).toBe("idle");

    act(() => client.simulateJoinError());
    expect(result.current.peerStatus).toBe("error");

    act(() => client.simulateDisconnected());
    expect(result.current.peerStatus).toBe("idle");

    act(() => client.simulateConnectionError());
    expect(result.current.peerStatus).toBe("error");
  });

  it("leaveRoom disconnects and returns to idle", ({ client, renderHook }) => {
    const { result } = renderHook(() => useConnection());
    act(() => client.simulateJoined());
    expect(result.current.peerStatus).toBe("connected");

    act(() => result.current.leaveRoom());
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.peerStatus).toBe("idle");
  });

  it("tracks reconnectionStatus across the reconnect lifecycle", ({ client, renderHook }) => {
    const { result } = renderHook(() => useConnection());

    act(() => client.simulateReconnectionStarted());
    expect(result.current.reconnectionStatus).toBe("reconnecting");

    act(() => client.simulateReconnected());
    expect(result.current.reconnectionStatus).toBe("idle");

    act(() => client.simulateReconnectionStarted());
    act(() => client.simulateReconnectionRetriesLimitReached());
    expect(result.current.reconnectionStatus).toBe("error");
  });

  it("promotes a joinError to a reconnection error only while reconnecting", ({ client, renderHook }) => {
    const { result } = renderHook(() => useConnection());

    // Not reconnecting → joinError must not flip reconnectionStatus.
    act(() => client.simulateJoinError());
    expect(result.current.reconnectionStatus).toBe("idle");

    act(() => client.simulateReconnectionStarted());
    act(() => client.simulateJoinError());
    expect(result.current.reconnectionStatus).toBe("error");
  });
});
