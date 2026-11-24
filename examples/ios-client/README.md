# VoIP in the iOS example app

This guide gets the iOS example app to ring when another phone calls it, including when the app is in the background, the screen is locked, or the app was swiped away.

Time: about 30 minutes the first time. Most of it is Apple setup.

To call an Android phone, also follow `../android-client/README.md`.

## How a call works

```
Caller app ──POST /call──▶ voip-test-server ──APNs VoIP push──▶ This iPhone
                                                                 PushKit wakes the app, CallKit rings
Both apps join the same Fishjam room for audio.
```

- The SDK rings the phone and tracks the call state. It **does not join the Fishjam room**. Your app joins when `VoIP.shared.callStatus` becomes `.connecting`, then calls `reportConnected()`.
- `voip-test-server/` is a small local server that sends the push. A real app would use its own backend.

## What you need

- A **real iPhone or iPad**. VoIP pushes never reach the Simulator. No SIM card is needed, because pushes work over Wi-Fi.
- A paid Apple Developer Program account.
- A Mac with Xcode and `xcodegen`, plus Node.js and Yarn. The Mac and the iPhone must be on the same Wi-Fi.
- The Fishjam values `FISHJAM_ID` and `FISHJAM_SDK_API_URL`.

## Step 1: Fishjam values

1. Copy `web-client-sdk/.env.example` to `web-client-sdk/.env`.
2. Fill in `FISHJAM_ID` and `FISHJAM_SDK_API_URL`.

## Step 2: Apple VoIP certificate

The server needs a certificate to send VoIP pushes to your iPhone.

**If a teammate gave you a combined `.pem` file** (certificate and private key in one file):

1. Save it as `voip-test-server/apns.pem`.
2. Skip to step 3.

It works only for bundle ID `io.fishjam.example.voipcall` and team `J5FM626PE2`, and only in Debug builds.

**To make your own certificate:**

1. In the Apple Developer portal, open **Identifiers** and create the App ID `io.fishjam.example.voipcall` with **Push Notifications** on.
2. On your Mac, open Keychain Access → menu **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority**. Enter your email, choose **Saved to disk**, and save the `.certSigningRequest` file.
3. In the portal, open **Certificates** and click **+**. Choose **VoIP Services Certificate**. If it is not listed, choose **Apple Push Notification service SSL (Sandbox & Production)**.
4. Choose the App ID from step 1, upload the `.certSigningRequest`, and download the `.cer` file.
5. Double-click the `.cer`. In Keychain Access → **My Certificates**, expand the new certificate so the private key shows under it.
6. Select the certificate → **File** → **Export Items…** → **Personal Information Exchange (.p12)**. Set a password and save as `voip-test-server/apns-voip.p12`.

The certificate expires after one year. To renew, repeat steps 2 to 6.

Never commit `apns.pem`, `.p12` files, or `.env`. They hold secrets.

## Step 3: Start the test server

```sh
cd voip-test-server
npm install
cp .env.example .env
```

Edit `voip-test-server/.env`:

- Combined `.pem`: keep `APNS_PEM_PATH=./apns.pem`.
- Own `.p12`: remove `APNS_PEM_PATH`, set `APNS_P12_PATH=./apns-voip.p12` and `APNS_P12_PASSWORD=<your password>`.
- Keep `IOS_BUNDLE_ID=io.fishjam.example.voipcall` and `APNS_ENV=sandbox`.

Then:

```sh
npm start
ipconfig getifaddr en0
```

The second command prints the Mac's Wi-Fi address. You need it in step 5. Allow incoming connections for Node if macOS asks.

The `GOOGLE_APPLICATION_CREDENTIALS` setting is for Android. Ignore it if you only use an iPhone.

## Step 4: Build and install the app

1. Check the signing values in `project.yml`: bundle ID `io.fishjam.example.voipcall` and team `J5FM626PE2`. The certificate works only for the bundle ID and team it was issued for.
   - If you use your own Apple team, change the team and the bundle IDs in `project.yml`. Change `IOS_BUNDLE_ID` in `voip-test-server/.env` to match, and use a certificate from your own team.
2. Plug in the iPhone and unlock it.
3. Run:

   ```sh
   cd web-client-sdk/examples/ios-client
   yarn start
   ```

   `yarn start` compiles the Rust core, runs `xcodegen`, builds with Xcode, and installs on the device you pick.
4. On the iPhone, allow the microphone and **Local Network** when asked. Local Network lets the app reach the test server on your Wi-Fi.

Use a **Debug** build. Debug builds use Apple's sandbox push service, and the server defaults to `APNS_ENV=sandbox`. A mismatch gives `BadDeviceToken`.

## Step 5: Make a call

1. Open the app and tap **VoIP**.
2. Set **Test server URL** to `http://<Mac address>:8787`. The default `192.168.100.24` is the author's address and will not work for you.
3. Keep **My user id** as `ios`. Set **Peer user id** to the other phone's user id. The Android example uses `android`.
4. Tap **Register token**. The screen shows `Registered ios`.
5. Check on the Mac:

   ```sh
   curl localhost:8787/users
   ```

6. Tap **Call peer**, or ring this iPhone from the Mac:

   ```sh
   curl -X POST localhost:8787/call \
     -H 'content-type: application/json' \
     -d '{"from":"android","to":"ios","roomName":"test1","isVideo":false}'
   ```

7. To test the background case, lock the iPhone or swipe the app away first, then ring it.
8. Answer within 10 seconds. The status moves `incoming` → `connecting` → `active`. After 10 seconds without an answer, the call ends as `failed`.

## What to try next

- Decline. Ignore for 45 seconds (`missed`). Hang up from the other side (`remote`).
- Mute and hold from the system call screen. Place a real cellular call during a VoIP call to test hold.
- Call waiting: ring the iPhone while it is already in a call.
- After a call, open Phone → Recents and tap the entry to redial.

## What the project already does

- `project.yml` sets `UIBackgroundModes: [audio, voip]` and the `aps-environment` entitlement.
- `AppDelegate.swift` calls `VoIP.registerForVoIPPushes()` at launch and forwards Recents redials with `VoIP.handleContinueUserActivity(_:)`.
- `VoIPCallView.swift` sends `VoIP.shared.token` to the server, starts calls, and answers them.

## SDK calls to copy into your own app

All on `VoIP.shared`, except the two static calls.

| Step | Call |
|---|---|
| Start listening | `VoIP.registerForVoIPPushes()` in `application(_:didFinishLaunchingWithOptions:)` |
| Forward Recents redials | `VoIP.handleContinueUserActivity(_:)` |
| Get the push token | `VoIP.shared.token`, or the `.tokenUpdated` event |
| Place a call | `startCall(to:roomName:isVideo:)` |
| Watch state | `callStatus` |
| Join the room | When status is `.connecting` and `currentCall.isOutgoing` is false |
| Tell the SDK the media is live | `reportConnected()` |
| Tell the SDK joining failed | `reportConnectFailed()` |
| Hang up | `endCall()` |

Rules:

- Call `registerForVoIPPushes()` at launch, so a push that starts the app can report a call right away.
- If the app receives a VoIP push and does not report a call to CallKit, iOS stops delivering future pushes. The SDK always reports one.
- Call `reportConnected()` within 10 seconds of the user answering.
- Joining a room does not send audio. Start the microphone after `reportConnected()`, or the recorder never starts.

Source files:

- Example: `FishjamExample/VoIPCallView.swift`, `FishjamExample/AppDelegate.swift`
- SDK: `../../packages/ios-client/FishjamClient/VoIP.swift`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No VoIP token yet` | Running in the Simulator, or the Push entitlement is missing | Use a real iPhone and the team and bundle ID from `project.yml` |
| `Register failed` | Wrong server URL, or different networks | Use the Mac's Wi-Fi address on the same Wi-Fi |
| Server log shows `BadDeviceToken` | Debug build with `APNS_ENV=production`, or the opposite | Debug builds need `APNS_ENV=sandbox` |
| No ring, no server error | Certificate is for a different bundle ID or team | Make a certificate for your App ID, and match `IOS_BUNDLE_ID` |
| Server forgot the phone | The server keeps tokens in memory only | Restart the app after you restart the server |
