import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { useBackgroundBlur } from 'react-native-executorch-webrtc';

// Selfie-segmentation model bundled with the app (Metro treats .pte as an asset,
// see metro.config.js). Embedding it avoids any runtime download.
const SEGMENTATION_MODEL = require('../assets/models/selfie_segmentation.pte');

/**
 * Resolves the bundled ExecuTorch selfie-segmentation model to a local file path
 * and exposes a camera `blurMiddleware` ready to hand to
 * `useCamera().setCameraTrackMiddleware`.
 *
 * `expo-asset` copies the bundled asset to a local file (once, cached) and gives
 * us a file:// URI. The Android native loader opens the path verbatim (it does
 * not strip the scheme), so we pass a bare filesystem path — which iOS also
 * accepts. Until the path resolves the returned middleware is no-op-safe and
 * `isModelReady` is false — `useBackgroundBlur` skips native initialization
 * while `modelUri` is empty.
 */
export function useBlurMiddleware(blurRadius = 15) {
  const [modelUri, setModelUri] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const asset = Asset.fromModule(SEGMENTATION_MODEL);
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        if (active && uri) {
          // ExecuTorch's file loader needs a plain path, not a file:// URI.
          setModelUri(uri.replace(/^file:\/\//, ''));
        }
      } catch (err) {
        console.error('[useBlurMiddleware] Failed to resolve segmentation model:', err);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const { blurMiddleware } = useBackgroundBlur({ modelUri, blurRadius });

  return { blurMiddleware, isModelReady: modelUri.length > 0 };
}
