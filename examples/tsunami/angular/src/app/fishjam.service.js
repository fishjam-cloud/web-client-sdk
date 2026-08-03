import { __decorate } from "tslib";
import { Injectable, signal } from "@angular/core";
import { FishjamClient, LocalStorageDevicePersistence, WebDeviceManager, } from "@fishjam-cloud/tsunami";
const createDefaultClient = () => new FishjamClient({
    deviceManager: new WebDeviceManager({ persistence: new LocalStorageDevicePersistence() }),
});
/**
 * Owns the application's single `FishjamClient` and bridges its observable
 * store into an Angular signal.
 *
 * The whole bridge is the three constructor lines: seed a signal with the
 * current snapshot and re-set it on every store notification. The store
 * notifies synchronously and its snapshots are immutable (a new object per
 * change), so `signal.set` sees a fresh reference exactly once per update and
 * Angular's zoneless scheduler takes it from there.
 */
let FishjamService = class FishjamService {
    client;
    /** Live `ClientState` snapshot; a new value lands synchronously on every store change. */
    state;
    unsubscribeFromStore;
    constructor(client) {
        this.client = client;
        const clientState = signal(client.getState());
        this.state = clientState.asReadonly();
        this.unsubscribeFromStore = client.subscribe(() => clientState.set(client.getState()));
    }
    ngOnDestroy() {
        this.unsubscribeFromStore();
        this.client.dispose();
    }
};
FishjamService = __decorate([
    Injectable({
        providedIn: "root",
        useFactory: () => new FishjamService(createDefaultClient()),
    })
], FishjamService);
export { FishjamService };
