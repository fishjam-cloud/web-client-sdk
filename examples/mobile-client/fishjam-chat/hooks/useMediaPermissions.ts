import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import {
  useCameraPermissions,
  useMicrophonePermissions,
} from "@fishjam-cloud/react-native-client";

export function useMediaPermissions() {
  const [queryCamera, requestCamera] = useCameraPermissions();
  const [queryMicrophone, requestMicrophone] = useMicrophonePermissions();
  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(
    null
  );
  const hasRequested = useRef(false);

  const checkPermissions = useCallback(async () => {
    let cam = await queryCamera();
    let mic = await queryMicrophone();

    if (!hasRequested.current) {
      hasRequested.current = true;
      if (cam !== "granted") cam = await requestCamera();
      if (mic !== "granted") mic = await requestMicrophone();
    }

    setPermissionsGranted(cam === "granted" && mic === "granted");
  }, [queryCamera, queryMicrophone, requestCamera, requestMicrophone]);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkPermissions();
      }
    });
    return () => subscription.remove();
  }, [checkPermissions]);

  const openSettings = useCallback(() => Linking.openSettings(), []);

  return { permissionsGranted, openSettings };
}
