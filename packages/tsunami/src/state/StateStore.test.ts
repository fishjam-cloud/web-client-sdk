import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { StateStore } from "./StateStore";

type TestState = {
  counter: number;
  label: string;
  slice: { value: number };
  otherSlice: { value: number };
};

const createTestStore = () =>
  new StateStore<TestState>({
    counter: 0,
    label: "initial",
    slice: { value: 1 },
    otherSlice: { value: 2 },
  });

describe("StateStore", () => {
  describe("snapshot stability and structural sharing", () => {
    it("returns the same snapshot object until state actually changes", () => {
      const store = createTestStore();
      const snapshotBefore = store.getState();

      store.update({ counter: 0, label: "initial" });

      expect(store.getState()).toBe(snapshotBefore);
    });

    it("does not notify listeners for a no-op update", () => {
      const store = createTestStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.update({ counter: 0 });

      expect(listener).not.toHaveBeenCalled();
    });

    it("keeps references of slices an update did not touch", () => {
      const store = createTestStore();
      const untouchedSliceBefore = store.getState().otherSlice;

      store.update({ slice: { value: 10 } });

      expect(store.getState().otherSlice).toBe(untouchedSliceBefore);
      expect(store.getState().slice).toEqual({ value: 10 });
    });

    it("replaces the snapshot object when a value changes", () => {
      const store = createTestStore();
      const snapshotBefore = store.getState();

      store.update({ counter: 5 });

      expect(store.getState()).not.toBe(snapshotBefore);
      expect(store.getState().counter).toBe(5);
    });
  });

  describe("notification timing", () => {
    it("notifies synchronously, after the snapshot is replaced", () => {
      const store = createTestStore();
      let observedCounter: number | null = null;
      store.subscribe(() => {
        observedCounter = store.getState().counter;
      });

      store.update({ counter: 1 });

      expect(observedCounter).toBe(1);
    });

    it("notifies once per effective update call", () => {
      const store = createTestStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.update({ counter: 1 });
      store.update({ counter: 1 });
      store.update({ label: "changed" });

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("delivers one notification for a multi-slice update", () => {
      const store = createTestStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.update({ counter: 1, label: "changed", slice: { value: 10 } });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("notifies again when a listener updates the store during a notification", () => {
      const store = createTestStore();
      const notifiedCounters: number[] = [];
      store.subscribe(() => {
        const { counter } = store.getState();
        notifiedCounters.push(counter);
        if (counter === 1) store.update({ counter: 2 });
      });

      store.update({ counter: 1 });

      expect(notifiedCounters).toEqual([1, 2]);
    });

    it("keeps notifying remaining listeners when one of them throws", () => {
      const listenerError = new Error("listener failure");
      const onListenerError = vi.fn();
      const store = new StateStore<TestState>(
        { counter: 0, label: "initial", slice: { value: 1 }, otherSlice: { value: 2 } },
        { onListenerError },
      );
      const throwingListener = vi.fn(() => {
        throw listenerError;
      });
      const laterListener = vi.fn();
      store.subscribe(throwingListener);
      store.subscribe(laterListener);

      store.update({ counter: 1 });

      expect(throwingListener).toHaveBeenCalledTimes(1);
      expect(laterListener).toHaveBeenCalledTimes(1);
      expect(onListenerError).toHaveBeenCalledWith(listenerError);
    });
  });

  describe("subscribe", () => {
    it("stops notifying after unsubscribe", () => {
      const store = createTestStore();
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      unsubscribe();
      store.update({ counter: 1 });

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not notify anyone after clear", () => {
      const store = createTestStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.clear();
      store.update({ counter: 1 });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("subscribeToSlice", () => {
    it("fires with the next and previous value when the selected slice changes", () => {
      const store = createTestStore();
      const sliceListener = vi.fn();
      store.subscribeToSlice((state) => state.slice, sliceListener);
      const previousSlice = store.getState().slice;

      store.update({ slice: { value: 10 } });

      expect(sliceListener).toHaveBeenCalledTimes(1);
      expect(sliceListener).toHaveBeenCalledWith({ value: 10 }, previousSlice);
    });

    it("does not fire when only unrelated slices change", () => {
      const store = createTestStore();
      const sliceListener = vi.fn();
      store.subscribeToSlice((state) => state.slice, sliceListener);

      store.update({ counter: 1, otherSlice: { value: 20 } });

      expect(sliceListener).not.toHaveBeenCalled();
    });

    it("fires once per change of the selected value", () => {
      const store = createTestStore();
      const sliceListener = vi.fn();
      store.subscribeToSlice((state) => state.counter, sliceListener);

      store.update({ counter: 1 });
      store.update({ counter: 2 });

      expect(sliceListener).toHaveBeenCalledTimes(2);
      expect(sliceListener).toHaveBeenNthCalledWith(1, 1, 0);
      expect(sliceListener).toHaveBeenNthCalledWith(2, 2, 1);
    });

    it("stops firing after unsubscribe", () => {
      const store = createTestStore();
      const sliceListener = vi.fn();
      const unsubscribe = store.subscribeToSlice((state) => state.slice, sliceListener);

      unsubscribe();
      store.update({ slice: { value: 10 } });

      expect(sliceListener).not.toHaveBeenCalled();
    });
  });

  describe("generics threading", () => {
    it("threads the state's type parameters through the store", () => {
      type PeerMetadata = { displayName: string };
      type ParameterizedState<Metadata> = { localPeer: { metadata: Metadata } | null };

      const store = new StateStore<ParameterizedState<PeerMetadata>>({ localPeer: null });
      const { localPeer } = store.getState();

      expectTypeOf(localPeer?.metadata).toEqualTypeOf<PeerMetadata | undefined>();
      expect(localPeer).toBeNull();
    });
  });
});
