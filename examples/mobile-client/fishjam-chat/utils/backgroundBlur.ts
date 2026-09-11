import { createBackgroundBlurEffect } from '@fishjam-cloud/video-effects/background-blur';
import { createCameraEffectMiddleware } from '@fishjam-cloud/video-effects/fishjam-react-native';
import { typeGpuPersonSegmentation } from '@fishjam-cloud/video-effects/segmentation/typegpu';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

const segmentationModel = Asset.fromModule(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@fishjam-cloud/video-effects/assets/selfie_segmenter.ssgbin'),
);

// Android release builds can't fetch a bundled asset by URL, so read it from a local copy.
async function loadSegmentationModel(): Promise<ArrayBuffer> {
  await segmentationModel.downloadAsync();
  const localUri = segmentationModel.localUri;
  if (!localUri) throw new Error('The segmentation model is not available.');
  return new File(localUri).arrayBuffer();
}

const segmentation = typeGpuPersonSegmentation({
  loadModel: loadSegmentationModel,
});

export function reportBackgroundBlurFailure(error: unknown) {
  console.warn('Background blur failed', error);
}

export const backgroundBlur = createCameraEffectMiddleware(
  createBackgroundBlurEffect(() => ({ segmentation, radius: 24 })),
  {
    onStatus: (status, error) => {
      if (status === 'error') reportBackgroundBlurFailure(error);
    },
  },
);
