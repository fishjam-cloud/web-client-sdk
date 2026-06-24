# voip-call-server

## Run

```bash
deno task start   # listens on :4400
```

## Environment variables

| Variable        | Required | Description                                                      |
|-----------------|----------|------------------------------------------------------------------|
| `APNS_KEY_ID`   | yes      | 10-char key ID from the Apple Developer portal (.p8 key)        |
| `APNS_TEAM_ID`  | yes      | 10-char Team ID from the Apple Developer portal                 |
| `APNS_BUNDLE_ID`| yes      | App bundle identifier, e.g. `com.example.voipcall`              |
| `APNS_KEY_PATH` | yes      | Filesystem path to the APNs `.p8` private key file             |
| `APNS_ENV`      | no       | `development` (default) or `production`                         |

Create a `.env` file in this directory (or export the variables before running):

```bash
export APNS_KEY_ID=XXXXXXXXXX
export APNS_TEAM_ID=XXXXXXXXXX
export APNS_BUNDLE_ID=com.example.voipcall
export APNS_KEY_PATH=./AuthKey_XXXXXXXXXX.p8
export APNS_ENV=development

deno task start
```

## API

| Method | Path                  | Body / Query                | Description                              |
|--------|-----------------------|-----------------------------|------------------------------------------|
| POST   | `/register`           | `{ username, voipToken }`   | Register / update device VoIP push token |
| GET    | `/users?exclude=<me>` |                             | List all registered users except `me`    |
| POST   | `/call`               | `{ from, to }`              | Initiate a call; sends VoIP push to callee; returns `{ callId, roomName }` |
| GET    | `/call/:id`           |                             | Poll call status (`ringing / answered / ended / cancelled`) |
| POST   | `/call/:id/answer`    |                             | Mark call as answered (called by callee) |
| POST   | `/cancel`             | `{ callId }`                | Cancel / hang up a call                  |

## APNs VoIP push payload

The push payload forwarded to the callee's device:

```json
{
  "aps": {},
  "roomId": "<roomName>",
  "username": "<callerUsername>",
  "callId": "<callId>",
  "displayName": "<callerUsername>"
}
```

iOS 13+ requires that every received VoIP push immediately reports an incoming call to CallKit — the `@fishjam-cloud/react-native-webrtc` pod handles this automatically.
