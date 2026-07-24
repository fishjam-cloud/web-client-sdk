import { act } from "@testing-library/react";

import { useDataChannel } from "../hooks/useDataChannel";
import { describe, expect, it } from "./support/fixtures";

describe("useDataChannel", () => {
  it("starts not ready / not loading / no error", ({ renderHook }) => {
    const { result } = renderHook(() => useDataChannel());
    expect(result.current.dataChannelReady).toBe(false);
    expect(result.current.dataChannelLoading).toBe(false);
    expect(result.current.dataChannelError).toBeNull();
  });

  it("errors when initializing before the peer is connected", async ({ renderHook }) => {
    const { result } = renderHook(() => useDataChannel());

    await act(async () => {
      await result.current.initializeDataChannel();
    });

    expect(result.current.dataChannelError?.message).toBe("Peer is not connected");
    expect(result.current.dataChannelReady).toBe(false);
  });

  it("creates channels and becomes ready when connected", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useDataChannel());

    act(() => client.simulateJoined());

    await act(async () => {
      await result.current.initializeDataChannel();
    });

    expect(client.createDataChannels).toHaveBeenCalledTimes(1);
    expect(result.current.dataChannelReady).toBe(true);
    expect(result.current.dataChannelError).toBeNull();
  });

  it("publishData forwards the payload and options to the client", ({ client, renderHook }) => {
    const { result } = renderHook(() => useDataChannel());
    const payload = new Uint8Array([1, 2, 3]);

    act(() => result.current.publishData(payload, { reliable: true }));

    expect(client.publishData).toHaveBeenCalledWith(payload, { reliable: true });
  });

  it("subscribeData delivers incoming data and unsubscribes", ({ client, renderHook }) => {
    const { result } = renderHook(() => useDataChannel());
    const received: Uint8Array[] = [];

    let unsub = () => {};
    act(() => {
      unsub = result.current.subscribeData((d) => received.push(d), { reliable: false });
    });

    act(() => client.simulateIncomingData(new Uint8Array([9])));
    expect(received).toHaveLength(1);

    act(() => unsub());
    act(() => client.simulateIncomingData(new Uint8Array([10])));
    expect(received).toHaveLength(1);
  });

  it("surfaces a data-channel error and drops readiness", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useDataChannel());

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.initializeDataChannel();
    });
    expect(result.current.dataChannelReady).toBe(true);

    act(() => client.simulateDataChannelsError(new Error("boom")));
    expect(result.current.dataChannelError?.message).toBe("boom");
    expect(result.current.dataChannelReady).toBe(false);
  });

  it("resets readiness on disconnect", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useDataChannel());

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.initializeDataChannel();
    });
    act(() => client.simulateDisconnected());

    expect(result.current.dataChannelReady).toBe(false);
  });
});
