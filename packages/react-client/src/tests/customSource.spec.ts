import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useCustomSource } from "../hooks/useCustomSource";
import { FakeFishjamClient } from "./support/fakeFishjamClient";
import { createFakeStream } from "./support/fakeMediaStream";
import { renderHookWithProvider } from "./support/renderWithProvider";

const avStream = () =>
  createFakeStream([
    { kind: "video", deviceId: "v" },
    { kind: "audio", deviceId: "a" },
  ]);

describe("useCustomSource", () => {
  it("exposes no stream until one is set", () => {
    const { result } = renderHookWithProvider(() => useCustomSource("cam-feed"));
    expect(result.current.stream).toBeUndefined();
  });

  it("publishes custom video + audio tracks when connected", async () => {
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useCustomSource("feed"), { client });

    act(() => client.simulateJoined());

    const stream = avStream();
    await act(async () => {
      await result.current.setStream(stream);
    });

    expect(result.current.stream).toBe(stream);
    const metas = client.addTrack.mock.calls.map((c) => (c[1] as { type: string }).type);
    expect(metas).toContain("customVideo");
    expect(metas).toContain("customAudio");
  });

  it("defers publishing until the room is joined when set before connecting", async () => {
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useCustomSource("feed"), { client });

    await act(async () => {
      await result.current.setStream(avStream());
    });
    expect(client.addTrack).not.toHaveBeenCalled();

    await act(async () => {
      client.simulateJoined();
    });

    expect(client.addTrack).toHaveBeenCalled();
  });

  it("removes tracks when the stream is cleared", async () => {
    const client = new FakeFishjamClient();
    const { result } = renderHookWithProvider(() => useCustomSource("feed"), { client });

    act(() => client.simulateJoined());
    await act(async () => {
      await result.current.setStream(avStream());
    });
    await act(async () => {
      await result.current.setStream(null);
    });

    expect(client.removeTrack).toHaveBeenCalled();
    expect(result.current.stream).toBeUndefined();
  });
});
