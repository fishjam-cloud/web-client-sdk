import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useConnection } from "../hooks/useConnection";
import { renderHookWithProvider } from "./support/renderWithProvider";

describe("useConnection", () => {
  it("starts idle", () => {
    const { result } = renderHookWithProvider(() => useConnection());
    expect(result.current.peerStatus).toBe("idle");
    expect(result.current.reconnectionStatus).toBe("idle");
  });

  it("joinRoom connects the client with a ws url, token and metadata", async () => {
    const { result, client } = renderHookWithProvider(() => useConnection());

    await act(async () => {
      await result.current.joinRoom({ peerToken: "tok-123", peerMetadata: { name: "alice" } });
    });

    expect(client.connect).toHaveBeenCalledTimes(1);
    const config = client.connect.mock.calls[0][0] as { url: string; token: string; peerMetadata: unknown };
    expect(config.token).toBe("tok-123");
    expect(config.peerMetadata).toEqual({ name: "alice" });
    expect(config.url.startsWith("wss://")).toBe(true);
    expect(config.url).toContain("test-fishjam-id");
  });

  it("defaults peerMetadata to an empty object", async () => {
    const { result, client } = renderHookWithProvider(() => useConnection());
    await act(async () => {
      await result.current.joinRoom({ peerToken: "tok" });
    });
    expect((client.connect.mock.calls[0][0] as { peerMetadata: unknown }).peerMetadata).toEqual({});
  });

  it("transitions peerStatus connecting → connected on the client events", () => {
    const { result, client } = renderHookWithProvider(() => useConnection());

    act(() => client.simulateConnectionStarted());
    expect(result.current.peerStatus).toBe("connecting");

    act(() => client.simulateJoined());
    expect(result.current.peerStatus).toBe("connected");
  });

  it("sets peerStatus to error on auth / join / connection errors", () => {
    const { result, client } = renderHookWithProvider(() => useConnection());
    act(() => client.simulateAuthError());
    expect(result.current.peerStatus).toBe("error");
  });

  it("leaveRoom disconnects and returns to idle", () => {
    const { result, client } = renderHookWithProvider(() => useConnection());
    act(() => client.simulateJoined());
    expect(result.current.peerStatus).toBe("connected");

    act(() => result.current.leaveRoom());
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(result.current.peerStatus).toBe("idle");
  });

  it("tracks reconnectionStatus across the reconnect lifecycle", () => {
    const { result, client } = renderHookWithProvider(() => useConnection());

    act(() => client.simulateReconnectionStarted());
    expect(result.current.reconnectionStatus).toBe("reconnecting");

    act(() => client.simulateReconnected());
    expect(result.current.reconnectionStatus).toBe("idle");

    act(() => client.simulateReconnectionStarted());
    act(() => client.simulateReconnectionRetriesLimitReached());
    expect(result.current.reconnectionStatus).toBe("error");
  });

  it("promotes a joinError to a reconnection error only while reconnecting", () => {
    const { result, client } = renderHookWithProvider(() => useConnection());

    // Not reconnecting → joinError must not flip reconnectionStatus.
    act(() => client.simulateJoinError());
    expect(result.current.reconnectionStatus).toBe("idle");

    act(() => client.simulateReconnectionStarted());
    act(() => client.simulateJoinError());
    expect(result.current.reconnectionStatus).toBe("error");
  });
});
