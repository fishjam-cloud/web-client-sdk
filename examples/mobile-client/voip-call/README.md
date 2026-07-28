# VoIP call example

A two-user calling app: an Expo React Native client (`app/`) and a small Deno
push + signaling server (`server/`). Calls ring through the native call UI
(CallKit on iOS, Telecom on Android) even when the app is backgrounded or
killed, and connect through a Fishjam room.

How it all works (native configuration, `VoIPProvider`, and the JS call flow)
is documented in the
[VoIP calls guide](https://documentation.fishjam.io/docs/how-to/client/voip-calls);
this README only covers running the example.

## Running the example

VoIP pushes can only be delivered through your own Apple and Firebase accounts,
so the first step is minting push credentials. Configure APNs to call iOS
devices, FCM to call Android devices, or both to call between them.

1. **Server credentials.** Create the APNs VoIP certificate (`apns.pem`) and/or
   the FCM service account key (`fcm-credentials.json`) as described in
   [`server/README.md`](./server/README.md), then start the server:

   ```bash
   cd server
   deno task start   # listens on :4400
   ```

2. **`google-services.json` (Android only).** The file is gitignored, so you
   have to fetch your own. In the
   [Firebase console](https://console.firebase.google.com/), open the same
   project the server's `fcm-credentials.json` came from → _Project settings_ →
   _Your apps_ → add an **Android** app if none exists → download
   `google-services.json` → save it at `app/google-services.json`.

   Its `package_name` must match `android.package` in `app.json` exactly
   (`io.fishjam.example.voipcall`), or the build fails with
   `No matching client found for package name`. Keep the file at the app root:
   `expo prebuild` copies it into `android/` for you, and a copy placed inside
   `android/` by hand doesn't survive `expo prebuild --clean`.

3. **App environment.** Copy `app/.env.example` to `app/.env` and fill it in:

   - `EXPO_PUBLIC_FISHJAM_ID`: your Fishjam app id.
   - `EXPO_PUBLIC_SANDBOX_API_URL`: the Sandbox API url from your Fishjam
     dashboard, used to mint peer tokens.
   - `EXPO_PUBLIC_VOIP_SERVER_URL`: where the devices can reach the server
     above. Not `localhost` when running on a physical phone; use your
     machine's LAN address.

4. **Run on real devices.** VoIP pushes never reach the iOS Simulator, and FCM
   needs Google Play services. Install dependencies from the repo root
   (`yarn`), then:

   ```bash
   cd app
   yarn ios       # or: yarn android
   ```

To test it, register two users on two devices and call between them. The
[guide's checklist](https://documentation.fishjam.io/docs/how-to/client/voip-calls#11-test-it)
lists the paths worth checking: ringing with the app killed, Recents redial,
and Hold & Accept.
