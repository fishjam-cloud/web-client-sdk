# voip-call-server

## Run

```bash
deno task start   # listens on :4400
```

## Credentials

Both services are optional — configure APNs to call iOS devices, FCM to call
Android devices, or both to call between them. On startup the server prints which
services are enabled, and `/call` answers `503` when the callee's platform has no
credentials.

## APNs certificate

APNs auth is certificate-based — you need a **VoIP Services certificate** from your
Apple Developer account. See Apple's guide:
[Establishing a certificate-based connection to APNs](https://developer.apple.com/documentation/usernotifications/establishing-a-certificate-based-connection-to-apns).

Drop the VoIP push certificate **and its private key, combined into one PEM**, at
`./apns.pem` — it's presented to APNs as a TLS client certificate. The bundle id and
sandbox host are set at the top of `main.ts`.

```bash
# combine an exported cert + key into one PEM
cat cert.pem key.pem > apns.pem
```

## FCM credentials

FCM (Android) push uses the [FCM HTTP v1 API](https://firebase.google.com/docs/cloud-messaging/send-message),
which authenticates with a **Firebase service account**. In the Firebase console
go to **Project settings → Service accounts → Generate new private key** and
download the JSON. See Google's guide:
[Authorize send requests](https://firebase.google.com/docs/cloud-messaging/auth-server).

Drop the downloaded file at `./fcm-credentials.json` — the server reads
`client_email`, `private_key`, and `project_id` from it to mint an OAuth access
token scoped to `firebase.messaging`.

## Push routing

A push token is only valid with the service that issued it, so each device records
its `platform` (`ios` or `android`) when it registers. `/call` looks up the
**callee's** platform and rings them through the matching service — an Android
caller reaching an iOS callee goes out over APNs, and an iOS caller reaching an
Android callee goes out over FCM.

## API

| Method | Path                  | Body / Query                        | Description                              |
| ------ | --------------------- | ----------------------------------- | ---------------------------------------- |
| POST   | `/register`           | `{ username, voipToken, platform }` | Register / update device VoIP push token |
| GET    | `/users?exclude=<me>` |                                     | List all registered users except `me`    |
| POST   | `/call`               | `{ from, to, roomName, isVideo }`   | Send a VoIP push to the callee           |

`platform` must be `"ios"` or `"android"`; anything else is rejected with `400`.

## APNs VoIP push payload

The push payload forwarded to the callee's device:

```json
{
  "roomName": "<roomName>",
  "displayName": "<callerUsername>",
  "isVideo": false
}
```

iOS 13+ requires that every received VoIP push immediately reports an incoming call to CallKit — the `@fishjam-cloud/react-native-webrtc` pod handles this automatically.

## FCM push payload

FCM values must be strings, so the same fields are sent as a high-priority
**data** message (`isVideo` is stringified):

```json
{
  "message": {
    "token": "<fcmToken>",
    "data": {
      "roomName": "<roomName>",
      "displayName": "<callerUsername>",
      "isVideo": "false"
    },
    "android": { "priority": "high" }
  }
}
```

The high-priority data message wakes `@fishjam-cloud/react-native-webrtc`'s
messaging service even when the app is backgrounded or killed, which reports the
incoming call to the native Telecom stack.
