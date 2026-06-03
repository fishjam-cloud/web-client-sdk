import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSandbox } from "../hooks/useSandbox";

const mockFetch = (response: { ok: boolean; status?: number; json?: () => Promise<unknown> }) => {
  const fetchSpy = vi.fn(async (_input: string | URL) => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: response.json ?? (async () => ({})),
  }));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
};

describe("useSandbox", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws if no sandboxApiUrl is provided", async () => {
    const { result } = renderHook(() => useSandbox({ sandboxApiUrl: "" }));
    await expect(result.current.getSandboxPeerToken("room", "peer")).rejects.toThrow(/sandboxApiUrl/);
  });

  it("getSandboxPeerToken builds the query and returns the peer token", async () => {
    const fetchSpy = mockFetch({ ok: true, json: async () => ({ peerToken: "pt-1" }) });
    const { result } = renderHook(() => useSandbox({ sandboxApiUrl: "https://sandbox.test/api" }));

    const token = await result.current.getSandboxPeerToken("my-room", "alice", "audio_only");

    expect(token).toBe("pt-1");
    const calledUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(calledUrl.searchParams.get("roomName")).toBe("my-room");
    expect(calledUrl.searchParams.get("peerName")).toBe("alice");
    expect(calledUrl.searchParams.get("roomType")).toBe("audio_only");
  });

  it("defaults roomType to conference", async () => {
    const fetchSpy = mockFetch({ ok: true, json: async () => ({ peerToken: "pt" }) });
    const { result } = renderHook(() => useSandbox({ sandboxApiUrl: "https://sandbox.test/api" }));

    await result.current.getSandboxPeerToken("room", "bob");
    const calledUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(calledUrl.searchParams.get("roomType")).toBe("conference");
  });

  it("getSandboxViewerToken gives a friendly error when the room is missing", async () => {
    mockFetch({ ok: false, status: 404 });
    const { result } = renderHook(() => useSandbox({ sandboxApiUrl: "https://sandbox.test/api" }));
    await expect(result.current.getSandboxViewerToken("ghost")).rejects.toThrow(/does not exist/);
  });

  it("getSandboxLivestream returns the streamer token payload", async () => {
    mockFetch({ ok: true, json: async () => ({ streamerToken: "st", room: { id: "r", name: "n" } }) });
    const { result } = renderHook(() => useSandbox({ sandboxApiUrl: "https://sandbox.test/api" }));
    const data = await result.current.getSandboxLivestream("room", true);
    expect(data.streamerToken).toBe("st");
  });
});
