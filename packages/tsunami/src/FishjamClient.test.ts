import { type ConnectConfig, FishjamClient as TsClient, type GenericMetadata } from "@fishjam-cloud/ts-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClientResourceScope } from "./ClientResourceScope";
import { ClientDisposedError } from "./errors";
import { FishjamClient } from "./FishjamClient";

const mediaStreamConstructor = vi.fn();

class FakeMediaStream {
  private readonly tracks: MediaStreamTrack[] = [];

  public constructor() {
    mediaStreamConstructor();
  }

  public addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }

  public removeTrack(track: MediaStreamTrack): void {
    const index = this.tracks.indexOf(track);
    if (index !== -1) this.tracks.splice(index, 1);
  }

  public getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }
}

function createTrack(stop = vi.fn()): MediaStreamTrack {
  return { stop } as unknown as MediaStreamTrack;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

const connectConfig: ConnectConfig<GenericMetadata> = {
  peerMetadata: undefined,
  token: "token",
  url: "https://fishjam.example",
};

describe("FishjamClient lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mediaStreamConstructor.mockClear();
    vi.stubGlobal("MediaStream", FakeMediaStream);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("has inert construction", () => {
    const WebSocketMock = vi.fn();
    const mediaDevices = {
      addEventListener: vi.fn(),
      enumerateDevices: vi.fn(),
      getUserMedia: vi.fn(),
    };
    const addGlobalEventListener = vi.fn();

    vi.stubGlobal("WebSocket", WebSocketMock);
    vi.stubGlobal("navigator", { mediaDevices });
    vi.stubGlobal("addEventListener", addGlobalEventListener);

    const timerCount = vi.getTimerCount();
    const client = new FishjamClient();

    expect(WebSocketMock).not.toHaveBeenCalled();
    expect(mediaDevices.enumerateDevices).not.toHaveBeenCalled();
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(mediaDevices.addEventListener).not.toHaveBeenCalled();
    expect(addGlobalEventListener).not.toHaveBeenCalled();
    expect(mediaStreamConstructor).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(timerCount);

    client.dispose();
  });

  it("stops controller-owned tracks and runs every registered cleanup", () => {
    const resources = new ClientResourceScope();
    const firstStop = vi.fn(() => {
      throw new Error("broken track");
    });
    const secondStop = vi.fn();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn(() => {
      throw new Error("broken cleanup");
    });

    const firstTrack = createTrack(firstStop);
    const secondTrack = createTrack(secondStop);
    resources.registerCleanup(firstCleanup);
    resources.registerCleanup(secondCleanup);
    resources.registerTrack(firstTrack);
    resources.registerTrack(secondTrack);

    resources.dispose();

    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondCleanup).toHaveBeenCalledOnce();
    expect(resources.isDisposed).toBe(true);

    resources.dispose();
    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondCleanup).toHaveBeenCalledOnce();
  });

  it("tears down ts-client and drops listeners exactly once", async () => {
    vi.spyOn(TsClient.prototype, "connect").mockResolvedValue();
    const disconnect = vi.spyOn(TsClient.prototype, "disconnect");
    const cleanup = vi.spyOn(TsClient.prototype, "cleanup");
    const client = new FishjamClient();
    client.on("joined", vi.fn());
    await client.connect(connectConfig);

    client.dispose();

    expect(client.eventNames()).toEqual([]);
    expect(client.isDisposed).toBe(true);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();

    client.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("unsubscribes resources registered through the wrapped client", () => {
    const unsubscribe = vi.fn();
    vi.spyOn(TsClient.prototype, "subscribeData").mockReturnValue(unsubscribe);
    const client = new FishjamClient();

    const removeSubscription = client.subscribeData(vi.fn(), { reliable: true });
    client.dispose();
    removeSubscription();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("rejects an in-flight connect when disposed", async () => {
    const connection = deferred<void>();
    vi.spyOn(TsClient.prototype, "connect").mockReturnValue(connection.promise);
    const client = new FishjamClient();

    const result = client.connect(connectConfig);
    client.dispose();

    await expect(result).rejects.toBeInstanceOf(ClientDisposedError);

    connection.resolve();
    await Promise.resolve();
  });

  it("tears down resources created after reentrant disposal during connect", async () => {
    let resourceOpen = false;
    const disconnect = vi.spyOn(TsClient.prototype, "disconnect").mockImplementation(() => {
      resourceOpen = false;
    });
    vi.spyOn(TsClient.prototype, "connect").mockImplementation(function (this: TsClient<GenericMetadata>) {
      this.emit("connectionStarted");
      resourceOpen = true;
      return Promise.resolve();
    });
    const client = new FishjamClient();
    client.on("connectionStarted", () => client.dispose());

    await expect(client.connect(connectConfig)).rejects.toBeInstanceOf(ClientDisposedError);

    expect(resourceOpen).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it("forwards signalling events without losing once semantics", async () => {
    vi.spyOn(TsClient.prototype, "connect").mockResolvedValue();
    const client = new FishjamClient();
    const joined = vi.fn();
    client.once("joined", joined);
    await client.connect(connectConfig);

    client.emit("joined", "peer-id", [], []);
    client.emit("joined", "peer-id", [], []);

    expect(joined).toHaveBeenCalledOnce();
  });

  it("does not take ownership of tracks passed through the signalling seam", async () => {
    const publication = deferred<string>();
    vi.spyOn(TsClient.prototype, "addTrack").mockReturnValue(publication.promise);
    const client = new FishjamClient();
    const stop = vi.fn();
    const track = createTrack(stop);

    const result = client.addTrack(track);
    client.dispose();

    expect(stop).not.toHaveBeenCalled();
    await expect(result).rejects.toBeInstanceOf(ClientDisposedError);

    publication.resolve("late-track-id");
    await Promise.resolve();
  });

  it("exposes the disposal reason to controller operations", async () => {
    const operation = deferred<void>();
    const resources = new ClientResourceScope();
    let lifecycleSignal: AbortSignal | undefined;

    const result = resources.run((signal) => {
      lifecycleSignal = signal;
      return operation.promise;
    });
    resources.dispose();

    expect(lifecycleSignal?.aborted).toBe(true);
    expect(lifecycleSignal?.reason).toBeInstanceOf(ClientDisposedError);
    await expect(result).rejects.toBe(lifecycleSignal?.reason);

    operation.reject(new Error("late failure"));
    await Promise.resolve();
  });

  it("observes an operation promise returned after synchronous disposal", async () => {
    const operation = deferred<void>();
    const then = vi.spyOn(operation.promise, "then");
    const resources = new ClientResourceScope();

    const result = resources.run(() => {
      resources.dispose();
      return operation.promise;
    });

    await expect(result).rejects.toBeInstanceOf(ClientDisposedError);
    expect(then).toHaveBeenCalledOnce();

    operation.reject(new Error("late failure"));
    await Promise.resolve();
  });

  it("turns a synchronous operation failure into a rejected operation promise", async () => {
    const resources = new ClientResourceScope();
    const failure = new Error("platform failure");

    const result = resources.run(() => {
      throw failure;
    });

    await expect(result).rejects.toBe(failure);
  });

  it("rejects connect after terminal disposal without touching ts-client", async () => {
    const connect = vi.spyOn(TsClient.prototype, "connect");
    const client = new FishjamClient();
    client.dispose();

    await expect(client.connect(connectConfig)).rejects.toBeInstanceOf(ClientDisposedError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("cancels a reconnect timer already scheduled by ts-client", async () => {
    vi.spyOn(TsClient.prototype, "connect").mockResolvedValue();
    const client = new FishjamClient();
    await client.connect(connectConfig);

    client.emit("socketError", new Event("error"));
    expect(vi.getTimerCount()).toBe(1);

    client.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
