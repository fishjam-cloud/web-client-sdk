import { Stack } from "expo-router";
import { FishjamProvider } from "@fishjam-cloud/mobile-client";

const FISHJAM_ID = process.env.EXPO_PUBLIC_FISHJAM_ID ?? "";

export default function RootLayout() {
  return (
    <FishjamProvider fishjamId={FISHJAM_ID}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="livestream/viewer"
          options={{ headerShown: true, title: "Viewer" }}
        />
        <Stack.Screen
          name="livestream/streamer"
          options={{ headerShown: true, title: "Streamer" }}
        />
        <Stack.Screen
          name="livestream/screen-sharing"
          options={{ headerShown: true, title: "Screen Sharing" }}
        />
      </Stack>
    </FishjamProvider>
  );
}
