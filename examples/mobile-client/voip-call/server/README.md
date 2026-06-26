# voip-call-server

## Run

```bash
deno task start   # listens on :4400
```

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

## API

| Method | Path                  | Body / Query                      | Description                              |
|--------|-----------------------|-----------------------------------|------------------------------------------|
| POST   | `/register`           | `{ username, voipToken }`         | Register / update device VoIP push token |
| GET    | `/users?exclude=<me>` |                                   | List all registered users except `me`    |
| POST   | `/call`               | `{ from, to, roomName, isVideo }` | Send a VoIP push to the callee           |

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
