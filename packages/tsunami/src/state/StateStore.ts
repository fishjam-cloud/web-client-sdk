export type StoreListener = () => void;

export type StateStoreOptions = {
  /** Handles a listener throwing during a flush; defaults to rethrowing asynchronously. */
  onListenerError?: (error: unknown) => void;
};

/**
 * Observable state container. Snapshots are stable (`getState` returns the
 * same object until a value changes) and structurally shared (an update
 * replaces only the slices it received). Notifications are coalesced to one
 * per tick — one per awaited operation, not one per `update()` call.
 */
export class StateStore<TState extends object> {
  private snapshot: TState;
  private readonly listeners = new Set<StoreListener>();
  private isNotificationScheduled = false;

  public constructor(
    initialState: TState,
    private readonly options: StateStoreOptions = {},
  ) {
    this.snapshot = initialState;
  }

  public getState = (): TState => this.snapshot;

  public subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Notifies only when the selected value changes (`Object.is`). */
  public subscribeToSlice = <Slice>(
    selector: (state: TState) => Slice,
    listener: (slice: Slice, previousSlice: Slice) => void,
  ): (() => void) => {
    let lastSeenSlice = selector(this.snapshot);
    return this.subscribe(() => {
      const nextSlice = selector(this.snapshot);
      if (Object.is(nextSlice, lastSeenSlice)) return;
      const previousSlice = lastSeenSlice;
      lastSeenSlice = nextSlice;
      listener(nextSlice, previousSlice);
    });
  };

  /** Applied synchronously; a call that changes nothing keeps the snapshot and notifies nobody. */
  public update(partial: Partial<TState>): void {
    const keys = Object.keys(partial) as (keyof TState)[];
    const hasChange = keys.some((key) => partial[key] !== this.snapshot[key]);
    if (!hasChange) return;

    this.snapshot = { ...this.snapshot, ...partial };
    this.scheduleNotification();
  }

  /** Drops all listeners; an already-scheduled notification becomes a no-op. */
  public clear(): void {
    this.listeners.clear();
  }

  private scheduleNotification(): void {
    if (this.isNotificationScheduled) return;
    this.isNotificationScheduled = true;

    queueMicrotask(() => {
      this.isNotificationScheduled = false;
      for (const listener of [...this.listeners]) {
        try {
          listener();
        } catch (error) {
          this.handleListenerError(error);
        }
      }
    });
  }

  private handleListenerError(error: unknown): void {
    if (this.options.onListenerError) {
      this.options.onListenerError(error);
      return;
    }
    // Rethrow out-of-band: the error stays observable without starving other listeners.
    queueMicrotask(() => {
      throw error;
    });
  }
}
