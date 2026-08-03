import { describe, expect, it } from "./support/fixtures";
/**
 * The Angular-specific value under test: the store→signal bridge in
 * FishjamService. The store notifies synchronously, so the signal must hold
 * the new snapshot the moment any other store subscriber runs.
 */
describe("store → signal bridge", () => {
    it("updates the signal synchronously on every store notification", ({ service, signalling }) => {
        const statusesFromSlice = [];
        const statusesFromSignal = [];
        // Reading the signal inside another store subscription proves the bridge
        // ran first and synchronously for the same notification. The slice
        // subscription fires exactly once per peerStatus change.
        service.client.subscribeToSlice((state) => state.peerStatus, (nextStatus) => {
            statusesFromSlice.push(nextStatus);
            statusesFromSignal.push(service.state().peerStatus);
        });
        signalling.simulateConnectionStarted();
        signalling.simulateJoined();
        signalling.simulateDisconnected();
        expect(statusesFromSlice).toEqual(["connecting", "connected", "idle"]);
        expect(statusesFromSignal).toEqual(statusesFromSlice);
    });
    it("keeps the signal value referentially stable until the state changes", ({ service, signalling }) => {
        const snapshotBefore = service.state();
        expect(service.state()).toBe(snapshotBefore);
        signalling.simulateConnectionStarted();
        const snapshotAfter = service.state();
        expect(snapshotAfter).not.toBe(snapshotBefore);
        // Untouched slices are structurally shared, so slice-level change
        // detection (e.g. `computed`) can rely on reference equality.
        expect(snapshotAfter.camera).toBe(snapshotBefore.camera);
        expect(snapshotAfter.remotePeers).toBe(snapshotBefore.remotePeers);
    });
    it("stops updating after the service is destroyed", ({ service, signalling }) => {
        service.ngOnDestroy();
        signalling.simulateConnectionStarted();
        expect(service.state().peerStatus).toBe("idle");
        expect(service.client.isDisposed).toBe(true);
    });
});
