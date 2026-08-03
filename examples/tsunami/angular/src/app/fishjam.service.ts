import { Injectable, type OnDestroy, signal, type Signal } from "@angular/core";
import {
  type ClientState,
  FishjamClient,
  LocalStorageDevicePersistence,
  WebDeviceManager,
} from "@fishjam-cloud/tsunami";

const createDefaultClient = (): FishjamClient =>
  new FishjamClient({
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
@Injectable({
  providedIn: "root",
  useFactory: () => new FishjamService(createDefaultClient()),
})
export class FishjamService implements OnDestroy {
  /** Live `ClientState` snapshot; a new value lands synchronously on every store change. */
  public readonly state: Signal<ClientState>;

  private readonly unsubscribeFromStore: () => void;

  public constructor(public readonly client: FishjamClient) {
    const clientState = signal(client.getState());
    this.state = clientState.asReadonly();
    this.unsubscribeFromStore = client.subscribe(() => clientState.set(client.getState()));
  }

  public ngOnDestroy(): void {
    this.unsubscribeFromStore();
    this.client.dispose();
  }
}
