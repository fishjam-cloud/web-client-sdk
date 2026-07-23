import { ClientDisposedError } from "./errors";

type Cleanup = () => void;

/**
 * Internal disposal boundary shared by FishjamClient and its composed
 * controllers.
 */
export class ClientResourceScope {
  private readonly abortController = new AbortController();
  private readonly cleanups = new Set<Cleanup>();
  private readonly tracks = new Set<MediaStreamTrack>();

  private disposed = false;
  private disposedError: ClientDisposedError | null = null;

  public get isDisposed(): boolean {
    return this.disposed;
  }

  public get signal(): AbortSignal {
    return this.abortController.signal;
  }

  public assertActive(): void {
    if (this.disposed) throw this.getDisposedError();
  }

  /** Registers cleanup that must run when the client is disposed. */
  public registerCleanup(cleanup: Cleanup): Cleanup {
    this.assertActive();
    this.cleanups.add(cleanup);

    return () => {
      this.cleanups.delete(cleanup);
    };
  }

  /** Registers a track whose lifecycle is owned by a core controller. */
  public registerTrack(track: MediaStreamTrack): Cleanup {
    this.assertActive();
    this.tracks.add(track);

    return () => {
      this.tracks.delete(track);
    };
  }

  /**
   * Runs an operation within the client disposal boundary. The public promise
   * rejects on disposal even when the underlying platform operation cannot be
   * cancelled. The underlying promise remains observed to prevent late
   * rejections from becoming unhandled.
   */
  public run<T>(operation: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
    if (this.disposed) return Promise.reject(this.getDisposedError());

    let result: PromiseLike<T>;
    try {
      result = operation(this.signal);
    } catch (error: unknown) {
      return Promise.reject(this.disposed ? this.getDisposedError() : error);
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(this.getDisposedError());
      if (this.disposed) {
        onAbort();
      } else {
        this.signal.addEventListener("abort", onAbort, { once: true });
      }

      Promise.resolve(result).then(
        (value) => {
          this.signal.removeEventListener("abort", onAbort);
          if (this.disposed) {
            reject(this.getDisposedError());
          } else {
            resolve(value);
          }
        },
        (error: unknown) => {
          this.signal.removeEventListener("abort", onAbort);
          reject(this.disposed ? this.getDisposedError() : error);
        },
      );
    });
  }

  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.disposedError = new ClientDisposedError();
    this.abortController.abort(this.disposedError);

    for (const track of this.tracks) {
      try {
        track.stop();
      } catch {
        // One broken track must not prevent the remaining resources from being released.
      }
    }

    const cleanups = [...this.cleanups].reverse();
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // Disposal is best-effort and must continue through the full registry.
      }
    }

    this.tracks.clear();
    this.cleanups.clear();
  }

  private getDisposedError(): ClientDisposedError {
    return (this.disposedError ??= new ClientDisposedError());
  }
}
