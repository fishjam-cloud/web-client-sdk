import { Stack } from "expo-router";
import { FishjamProvider } from "@fishjam-cloud/mobile-client";

const FISHJAM_ID = process.env.EXPO_PUBLIC_FISHJAM_ID ?? "";

export default function RootLayout() {
  return (
    <FishjamProvider fishjamId={FISHJAM_ID}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ title: "Home" }} />
        <Stack.Screen
          name="livestream/viewer"
          options={{ headerShown: true, title: "Viewer", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="livestream/streamer"
          options={{ headerShown: true, title: "Streamer", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="livestream/screen-sharing"
          options={{ headerShown: true, title: "Screen Sharing", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="room/preview"
          options={{ headerShown: true, title: "Preview", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="room/[roomName]"
          options={{ headerShown: true, title: "Room", headerBackTitle: "Back" }}
        />
      </Stack>
    </FishjamProvider>
  );
}
