# iOS VoIP push registration via config plugin — implementation plan

> Automates what the example app currently does by hand at
> [`AppDelegate.swift:25`](./app/ios/voipcall/AppDelegate.swift) —
> `VoipManager.registerForVoIPPushes()` — so consumers of
> `@fishjam-cloud/react-native-client` don't have to hand-edit their AppDelegate.
> Verified against the tree 2026-07-13.

## Current state

- Native PushKit registration lives in the webrtc fork:
  `packages/react-native-webrtc/ios/RCTWebRTC/VoipManager.h:9` exposes
  `+ (void)registerForVoIPPushes`, implemented at `VoipManager.m:24-36`
  (lazily creates a `PKPushRegistry`, sets `desiredPushTypes` to `PKPushTypeVoIP`).
- Nothing calls it automatically. The example app calls it by hand at
  `examples/mobile-client/voip-call/app/ios/voipcall/AppDelegate.swift:25`,
  inside `didFinishLaunchingWithOptions`, right after `bindReactNativeFactory(factory)`.
- The Android side already has an equivalent opt-in config plugin
  (`packages/mobile-client/plugin/src/withFishjamVoipAndroid.ts`, gated by
  `android.enableVoip`) that injects manifest permissions/components. iOS has no
  matching plugin — this plan closes that gap.
- `packages/mobile-client/plugin/src/withFishjamIos.ts` already composes several
  `withInfoPlist`/`withXcodeProject`/`withPodfileProperties` mods behind `ios.*` flags
  (screensharing, PiP, VoIP background mode, VoIP timeouts) — the new mod follows the
  same pattern.

## Decision: `withAppDelegate` + `mergeContents`, not AppDelegate Subscribers

Expo docs steer native modules toward `ExpoAppDelegateSubscriber` and call
`withAppDelegate` string-patching "strongly discouraged." Subscribers were rejected
here because they require `expo-modules-core` as a **runtime** dependency — this SDK
must work in bare React Native with zero runtime Expo deps. `withAppDelegate` is
build-time only (`expo prebuild`), so it doesn't compromise that constraint.

The "discouraged" risk (duplicate inserts across re-prebuilds, brittle anchors) is
mitigated by `@expo/config-plugins`' own `mergeContents` helper — it wraps the
inserted line in `// @generated begin/end <tag>` markers so re-prebuilds **replace**
the block instead of duplicating it, and reports `didMerge: false` if the anchor
isn't found (fail loud, not silently).

### Known fragility (accepted, not blocking)

1. **Swift-only.** Expo's AppDelegate template moved objc → Swift in SDK 52. Consumers
   on SDK ≤51 have an objc `AppDelegate.mm`; the mod must detect
   `modResults.language !== 'swift'` and throw a clear error pointing at the manual
   fallback, not silently no-op.
2. **`mergeContents` is an internal import** — `@expo/config-plugins/build/utils/generateCode`,
   not part of the package's public `exports`. Widely relied on by other plugins
   (this is the standard idempotent-injection pattern in the Expo ecosystem) but not a
   stability contract. Most likely thing to break on an `@expo/config-plugins` major bump.
3. **Anchor drift.** If Expo reshuffles the AppDelegate template again, the merge fails
   loud via `didMerge` — a build-time error, not a silent runtime gap.

Net: acceptable for a one-line injection given the loud-failure behavior; not silently
broken in production if the anchor ever moves.

## Files to change

| File | Change |
|---|---|
| `packages/mobile-client/plugin/src/types.ts` | Add `ios.enableVoip?: boolean` to `FishjamPluginOptions['ios']`, gating the new mod (mirrors `android.enableVoip`) |
| `packages/mobile-client/plugin/src/withFishjamIos.ts` | Add `withFishjamVoipRegistration` mod (import `withAppDelegate` + `mergeContents`); wire it into `withFishjamIos`'s composition |
| `packages/mobile-client/README.md` | Document `ios.enableVoip`; add a bare-RN manual-line fallback section (mirrors the existing Android bare-RN section) |
| `examples/mobile-client/voip-call/app/ios/voipcall/AppDelegate.swift` | Once the plugin injects the call, remove the hand-added `VoipManager.registerForVoIPPushes()` at line 25 and set `ios.enableVoip: true` in the example's Expo config, proving the plugin works end-to-end |

No changes needed in `packages/react-native-webrtc` — `VoipManager` already ships as-is.

## Sketch

```ts
// withFishjamIos.ts
import { withAppDelegate, type ConfigPlugin } from '@expo/config-plugins';
import { mergeContents } from '@expo/config-plugins/build/utils/generateCode';

/**
 * Registers PushKit VoIP at launch by injecting one call into the iOS AppDelegate.
 * Opt in with `ios.enableVoip`. Uses tagged markers so repeated prebuilds replace
 * (not duplicate) the block.
 */
const withFishjamVoipRegistration: ConfigPlugin<FishjamPluginOptions> = (config, props) => {
  if (!props?.ios?.enableVoip) {
    return config;
  }

  return withAppDelegate(config, (configuration) => {
    const { language, contents } = configuration.modResults;

    if (language !== 'swift') {
      throw new Error(
        `withFishjamVoipRegistration only supports a Swift AppDelegate, found "${language}". ` +
          `Add "VoipManager.registerForVoIPPushes()" to didFinishLaunchingWithOptions manually.`,
      );
    }

    if (contents.includes('VoipManager.registerForVoIPPushes()') &&
        !contents.includes('@generated begin fishjam-voip-register')) {
      // Already present by hand (e.g. a consumer who added it before adopting the
      // plugin). Don't double-inject.
      return configuration;
    }

    const merged = mergeContents({
      tag: 'fishjam-voip-register',
      src: contents,
      newSrc: '    VoipManager.registerForVoIPPushes()',
      anchor: /bindReactNativeFactory\(factory\)/,
      offset: 1,
      comment: '//',
    });

    if (!merged.didMerge) {
      throw new Error(
        'withFishjamVoipRegistration could not find the AppDelegate anchor ' +
          '"bindReactNativeFactory(factory)". The Expo AppDelegate template may have changed — ' +
          'file an issue or add the call manually.',
      );
    }

    configuration.modResults.contents = merged.contents;
    return configuration;
  });
};

const withFishjamIos: ConfigPlugin<FishjamPluginOptions> = (config, props) => {
  // ...existing screensharing + podfile + PiP + background mode + timeouts...
  config = withFishjamVoipRegistration(config, props); // <-- add
  return config;
};
```

### Anchor choice

`bindReactNativeFactory\(factory\)` — matches the example app's AppDelegate exactly,
inserts right after RN bootstrap. Alternative `didFinishLaunchingWithOptions` is more
template-agnostic but lands at the method signature, requiring a deeper offset into
the body — slightly more fragile. Go with `bindReactNativeFactory` first; fall back to
the method-signature anchor only if real-world Expo templates diverge from the example.

## Open questions for whoever picks this up

- Should `ios.enableVoip` also gate the existing `ios.enableVoIPBackgroundMode` Info.plist
  flag (`withFishjamVoIPBackgroundMode`, `withFishjamIos.ts:298`), or stay independent?
  Today they're separate flags; bundling might simplify the README but reduces flexibility
  for consumers who want the background mode without PushKit registration (unlikely, but
  worth deciding deliberately rather than accidentally).
- Confirm minimum supported Expo SDK for this package before deciding whether the
  Swift-only guard needs an objc fallback (`AppDelegate.mm` regex path) or can just throw.
