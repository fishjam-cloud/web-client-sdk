import { afterEach, describe, expect, it, vi } from "vitest";

import { buildLivestreamWhepUrl, buildLivestreamWhipUrl, httpToWebsocketUrl, resolveFishjamUrl } from "./fishjamUrl";
import { getSandboxLivestream, getSandboxPeerToken, getSandboxViewerToken, MissingSandboxApiUrlError } from "./sandbox";

const mockFetch = (options: { ok: boolean; status?: number; json?: () => Promise<unknown> }) => {
  const fetchSpy = vi.fn(async (_input: string | URL) => ({
    ok: options.ok,
    status: options.status ?? (options.ok ? 200 : 500),
    json: options.json ?? (async () => ({})),
  }));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sandbox helpers", () => {
  it("throws a typed error when no sandboxApiUrl is provided", async () => {
    await expect(getSandboxPeerToken("", "room", "peer")).rejects.toBeInstanceOf(MissingSandboxApiUrlError);
    await expect(getSandboxPeerToken("", "room", "peer")).rejects.toThrow(/sandboxApiUrl/);
  });

  it("getSandboxPeerToken builds the query and returns the peer token", async () => {
    const fetchSpy = mockFetch({ ok: true, json: async () => ({ peerToken: "pt-1" }) });

    const peerToken = await getSandboxPeerToken("https://sandbox.example/api", "my-room", "alice", "audio_only");

    expect(peerToken).toBe("pt-1");
    const requestedUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(requestedUrl.searchParams.get("roomName")).toBe("my-room");
    expect(requestedUrl.searchParams.get("peerName")).toBe("alice");
    expect(requestedUrl.searchParams.get("roomType")).toBe("audio_only");
  });

  it("defaults roomType to conference", async () => {
    const fetchSpy = mockFetch({ ok: true, json: async () => ({ peerToken: "pt" }) });

    await getSandboxPeerToken("https://sandbox.example/api", "room", "bob");

    expect(new URL(fetchSpy.mock.calls[0][0]).searchParams.get("roomType")).toBe("conference");
  });

  it("getSandboxViewerToken reports a missing livestream room", async () => {
    mockFetch({ ok: false, status: 404 });

    await expect(getSandboxViewerToken("https://sandbox.example/api", "nope")).rejects.toThrow(/does not exist/);
  });

  it("getSandboxLivestream returns the streamer token payload", async () => {
    mockFetch({ ok: true, json: async () => ({ streamerToken: "st", room: { id: "1", name: "room" } }) });

    const data = await getSandboxLivestream("https://sandbox.example/api", "room", true);

    expect(data.streamerToken).toBe("st");
  });
});

describe("fishjam url helpers", () => {
  it("resolves a bare fishjam id to the cloud connect url", () => {
    expect(resolveFishjamUrl("my-id")).toBe("https://fishjam.io/api/v1/connect/my-id");
  });

  it("passes a full url through and converts to websocket", () => {
    expect(httpToWebsocketUrl(resolveFishjamUrl("https://cloud.example/api/v1/connect/x"))).toBe(
      "wss://cloud.example/api/v1/connect/x",
    );
  });

  it("builds livestream urls from the fishjam id domain", () => {
    expect(buildLivestreamWhipUrl("https://cloud.example/api/v1/connect/x")).toBe(
      "https://cloud.example/api/v1/live/api/whip",
    );
    expect(buildLivestreamWhepUrl("bare-id")).toBe("https://fishjam.io/api/v1/live/api/whep");
  });

  it("rejects an empty fishjam id for livestream urls", () => {
    expect(() => buildLivestreamWhipUrl("")).toThrow(/fishjamId is required/);
  });
});
