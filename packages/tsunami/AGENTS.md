# tsunami — implementation guide

Error model, decided in FCE-3580. Follow it exactly; do not invent new error
mechanisms.

## The rule

**Both surfaces, one error object.** A failing imperative method rejects with
a typed `FishjamError` subclass, and the same object is written to the
matching `ClientState` field. Success on the same resource clears the field.

| Path                                | Contract                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device acquisition                  | Rejects with a `DeviceError` subclass; same object in `cameraError` / `microphoneError`. Exception: `initializeDevices` _resolves_ with a result (degraded init is a supported outcome). |
| `addTrack`, room refuses track kind | Rejects with `TrackTypeError` — never a synchronous throw. Keep-local recovery is the adapter's policy.                                                                                  |
| `connect()`                         | Rejects with `AuthError` / `JoinError` / `SocketError` / `ConnectionError` (never `undefined`, never hangs) and sets `peerStatus: "error"` — one shared event list for both surfaces.    |

## Rules

1. Per-failure classes in domain files (`devices/errors.ts`, …): extend
   `FishjamError`, explicit `this.name` literal (minification-safe), set
   `recoverability`, original failure as `cause`. No `{ name }` objects,
   codes, or reason unions.
2. Land error classes with the code that first throws them (YAGNI).
3. Misuse errors (`ClientDisposedError`) are the only sync throws; never in state.
4. Platform error shapes stay behind `IDeviceManager` — DOMException
   classification belongs in `WebDeviceManager`, never in core.
5. Every error path ships both tests: typed rejection + state transition.
6. `AbortError` is cancellation, not failure — never mapped or stored.
