import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";
import {
  useCameraPermissions,
  useMicrophonePermissions,
} from "@fishjam-cloud/react-native-client";

export function useMediaPermissions() {
  const camera = useCameraPermissions();
  const microphone = useMicrophonePermissions();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      let cam = await camera.query();
      let mic = await microphone.query();

      if (cam !== "granted") cam = await camera.request();
      if (mic !== "granted") mic = await microphone.request();

      setGranted(cam === "granted" && mic === "granted");
    })();
  }, [camera, microphone]);

  const openSettings = useCallback(() => Linking.openSettings(), []);

  return { granted, openSettings };
}
