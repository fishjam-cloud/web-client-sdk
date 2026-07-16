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

| Method    | Path                  | Body / Query                        | Description                              |
| --------- | --------------------- | ----------------------------------- | ---------------------------------------- |
| POST      | `/register`           | `{ username, voipToken, platform }` | Register / update device VoIP push token |
| GET       | `/users?exclude=<me>` |                                     | List all registered users except `me`    |
| POST      | `/call`               | `{ from, to, roomName, isVideo, avatarUrl? }` | Send a VoIP push to the callee   |
| WebSocket | `/ws?username=<name>` |                                     | Bidirectional signaling socket           |

## Signaling (WebSocket)

Every connected app opens a persistent WebSocket at `/ws?username=<name>`. The
server maintains an in-memory `username -> WebSocket` map and acts as a simple
relay: any JSON message that contains a `to` field is forwarded to that user's
socket, with `from` stamped to the sender's username.

### Message: `call-cancelled`

Sent by the **caller** when they cancel before the callee has answered. The
server relays it immediately to the callee, which calls `endCall()` to dismiss
the ringing UI.

**Caller → Server:**

```json
{ "type": "call-cancelled", "to": "<callee>", "roomName": "<roomName>" }
```

**Server → Callee:**

```json
{
  "type": "call-cancelled",
  "to": "<callee>",
  "roomName": "<roomName>",
  "from": "<caller>"
}
```

The callee only acts on this message when the call is still ringing (i.e.
`startedAt` is `null` and the call is not outgoing). If the call was already
answered the message is silently ignored.

`platform` must be `"ios"` or `"android"`; anything else is rejected with `400`.

## APNs VoIP push payload

The push payload forwarded to the callee's device:

```json
{
  "roomName": "<roomName>",
  "displayName": "<callerUsername>",
  "isVideo": false,
  "avatarUrl": "https://…/caller.jpg"
}
```

`avatarUrl` is optional. On **Android** the caller photo is downloaded and shown
in the incoming-call notification and full-screen UI (falling back to initials on
failure). On **iOS** CallKit cannot render caller images, so it is delivered to JS
(`onIncoming` payload) only for your own in-app UI. The example client sends a
[picsum](https://picsum.photos) image seeded by the caller name, and the server
falls back to the same when the request omits `avatarUrl`.

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
      "isVideo": "false",
      "avatarUrl": "https://…/caller.jpg"
    },
    "android": { "priority": "high" }
  }
}
```

The high-priority data message wakes `@fishjam-cloud/react-native-webrtc`'s
messaging service even when the app is backgrounded or killed, which reports the
incoming call to the native Telecom stack.
