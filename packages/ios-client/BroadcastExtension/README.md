# Broadcast Upload Extension

Template for iOS screen sharing. Copy these files into a Broadcast Upload Extension
target in the host app.

## Setup

1. Create a Broadcast Upload Extension target (Swift, no UI extension).
2. Replace its files with the ones in this folder.
3. Enable the App Groups capability on both the app and the extension.
4. Set the same group id in:
   - the app entitlements
   - the extension entitlements
   - the extension Info.plist key `RTCAppGroupIdentifier`
   - the app Info.plist key `RTCAppGroupIdentifier`
5. Set the app Info.plist key `RTCScreenSharingExtension` to the extension's
   bundle id (for example `io.fishjam.ios.example.ScreenBroadcastExtension`).
   The extension bundle id must start with the app bundle id.

The host SDK listens on a Unix socket named `rtc_SSFD` inside the App Group
container. The extension writes JPEG frames to that socket.
