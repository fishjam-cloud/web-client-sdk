# VoIP in the Android example app

This guide gets the Android example app to ring when another phone calls it, including when the app is in the background, the screen is locked, or the app was swiped away.

Time: about 20 minutes the first time.

To call an iPhone, also follow `../ios-client/README.md`.

## How a call works

```
Caller app ──POST /call──▶ voip-test-server ──FCM data message──▶ This phone
                                                                    Telecom rings
Both apps join the same Fishjam room for audio.
```

- The SDK rings the phone and tracks the call state. It **does not join the Fishjam room**. Your app joins when `VoIP.callStatus` becomes `Connecting`, then calls `VoIP.reportConnected()`.
- `voip-test-server/` is a small local server that sends the push. A real app would use its own backend.

## What you need

- A phone or emulator with Google Play services, on Android 8 or newer. No SIM card is needed.
- A free Firebase project.
- Node.js and Yarn on the computer. The computer and the phone must be on the same Wi-Fi.
- The Fishjam values `FISHJAM_ID` and `FISHJAM_SDK_API_URL`.

## Step 1: Fishjam values

1. Copy `web-client-sdk/.env.example` to `web-client-sdk/.env`.
2. Fill in `FISHJAM_ID` and `FISHJAM_SDK_API_URL`.

## Step 2: Firebase

1. Open the [Firebase console](https://console.firebase.google.com) and click **Add project**. Turn Google Analytics off.
2. Click **Add app** → Android. Use the package name `io.fishjam.example`.
3. Download `google-services.json` and save it as `app/google-services.json` in this folder. The build applies the Google Services plugin only when this file exists. Without it, the app builds but never gets a push token.
4. Open Project settings → **Service accounts** → **Generate new private key**. Save the file as `voip-test-server/firebase-service-account.json`.

Never commit `google-services.json` or `firebase-service-account.json`. They hold secrets.

## Step 3: Start the test server

```sh
cd voip-test-server
npm install
cp .env.example .env
npm start
```

1. In `voip-test-server/.env`, check that `GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json`.
2. Find the computer's Wi-Fi address. You need it in step 5:

   ```sh
   ipconfig getifaddr en0
   ```

3. Allow incoming connections for Node if macOS asks.

The `APNS_*` settings in `.env` are for iPhones. Ignore them if you only use Android.

## Step 4: Build and install the app

```sh
cd web-client-sdk/examples/android-client
yarn start
```

`yarn start` compiles the Rust core, builds the app, and installs it on the device you pick. To skip the Rust step, run `./gradlew :app:installDebug`.

Then, on the phone:

1. Open the app and allow notifications when asked.
2. Android 14 and newer: if the call does not show on the lock screen, open Settings → Apps → Fishjam Example and allow **Full-screen notifications**.
3. Phones from Xiaomi, Oppo, and Samsung stop background apps early. Set the app's battery use to **Unrestricted**.

## Step 5: Make a call

1. Open the app and tap **VoIP**.
2. Set **Test server URL** to `http://<computer address>:8787`. The default `192.168.100.24` is the author's address and will not work for you.
3. Keep **My user id** as `android`. Set **Peer user id** to the other phone's user id. The iOS example uses `ios`.
4. Tap **Register**. The screen shows `Registered android`.
5. Check on the computer:

   ```sh
   curl localhost:8787/users
   ```

6. Tap **Call peer**, or ring this phone from the computer:

   ```sh
   curl -X POST localhost:8787/call \
     -H 'content-type: application/json' \
     -d '{"from":"ios","to":"android","roomName":"test1","isVideo":false}'
   ```

7. To test the background case, lock the phone or swipe the app away first, then ring it.
8. Answer within 10 seconds. The status moves `Incoming` → `Connecting` → `Active`. After 10 seconds without an answer, the call ends as `Failed`.

## What to try next

- Decline. Ignore for 45 seconds (`Missed`). Hang up from the other side (`Remote`).
- Mute and hold from the system call screen.
- Call waiting: ring the phone while it is already in a call.

## What the example already does

- `MainActivity.kt` calls `VoIP.attach(applicationContext)`.
- The SDK manifest adds the Firebase messaging service and most permissions. The example manifest also lists `FOREGROUND_SERVICE_PHONE_CALL`, `MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT`, and `POST_NOTIFICATIONS`.
- `VoIPCallScreen.kt` sends `VoIP.token` to the server, starts calls, and answers them.

## SDK calls to copy into your own app

All in `io.fishjam.client.voip.VoIP`.

| Step | Call |
|---|---|
| Start listening | `VoIP.attach(applicationContext)` in `onCreate` |
| Get the push token | `VoIP.token` |
| Place a call | `VoIP.startCall(peerId, roomName, isVideo)` |
| Watch state | `VoIP.callStatus` |
| Join the room | When status is `Connecting` and `currentCall.isOutgoing` is false |
| Tell the SDK the media is live | `VoIP.reportConnected()` |
| Tell the SDK joining failed | `VoIP.reportConnectFailed()` |
| Hang up | `VoIP.endCall(CallEndedReason.Local)` |

Rules:

- Call `reportConnected()` within 10 seconds of the user answering.
- Joining a room does not send audio. Start the microphone yourself after joining.

Source files:

- Example: `app/src/main/java/io/fishjam/example/VoIPCallScreen.kt`
- SDK: `../../packages/android-client/client/src/main/java/io/fishjam/client/voip/`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No FCM token yet` | `google-services.json` is missing, or the phone has no Google Play services | Add the file, rebuild, and use a Google Play emulator image |
| `Register failed` | Wrong server URL, or different networks | Use the computer's Wi-Fi address on the same Wi-Fi |
| No ring after you force-stop the app | Android blocks pushes to force-stopped apps | Open the app once |
| No ring on API 24 or 25 | Ringing needs Android 8 | Use Android 8 or newer |
| Server forgot the phone | The server keeps tokens in memory only | Restart the app after you restart the server |
