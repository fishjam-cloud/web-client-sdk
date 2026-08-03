/**
 * Observable state container. Snapshots are stable (`getState` returns the
 * same object until a value changes) and structurally shared (an update
 * replaces only the slices it received). Listeners are notified synchronously
 * on every effective `update()` — write related changes as one `update()` call
 * to get one notification; UI frameworks coalesce same-tick renders themselves.
 */
export class StateStore {
  options;
  snapshot;
  listeners = new Set();
  constructor(initialState, options = {}) {
    this.options = options;
    this.snapshot = initialState;
  }
  getState = () => this.snapshot;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Notifies only when the selected value changes (`Object.is`). */
  subscribeToSlice = (selector, listener) => {
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
  update(partial) {
    const keys = Object.keys(partial);
    const hasChange = keys.some((key) => partial[key] !== this.snapshot[key]);
    if (!hasChange) return;
    this.snapshot = { ...this.snapshot, ...partial };
    this.notify();
  }
  /** Drops all listeners. */
  clear() {
    this.listeners.clear();
  }
  notify() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        this.handleListenerError(error);
      }
    }
  }
  handleListenerError(error) {
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
