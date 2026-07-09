import { Platform } from 'react-native';

// rnwebgpu/native-texture gates the zero-copy shared-surface + external-texture path.
// The camera-import feature differs by platform: iOS delivers biplanar NV12 IOSurfaces
// (dawn-multi-planar-formats); Android delivers YUV_420 AHardwareBuffers imported through an
// external YCbCr Vulkan sampler (opaque-ycbcr-android-for-external-texture). Without the right
// one, importing the camera fails on every frame on a real device.
const REQUIRED_FEATURES: GPUFeatureName[] =
  Platform.OS === 'android'
    ? ['rnwebgpu/native-texture' as GPUFeatureName, 'opaque-ycbcr-android-for-external-texture' as GPUFeatureName]
    : ['rnwebgpu/native-texture' as GPUFeatureName, 'dawn-multi-planar-formats' as GPUFeatureName];

/**
 * The GPU features a device must have to import camera frames and Fishjam output surfaces on this
 * platform. {@link useCameraWebGpuDevice} requests them for you; pass them yourself as
 * `requiredFeatures` in `GPUDeviceDescriptor` when you bring your own device.
 *
 * @group WebGPU
 */
export function getRequiredWebGpuCameraFeatures(): GPUFeatureName[] {
  return [...REQUIRED_FEATURES];
}

/**
 * Throws a descriptive error when `device` is missing any feature required to import camera
 * frames or Fishjam output surfaces on this platform. Called automatically on devices passed as
 * an override; call it yourself to validate a device early.
 *
 * @group WebGPU
 */
export function assertWebGpuDeviceSupportsCameraImport(device: GPUDevice): void {
  const missingFeatures = REQUIRED_FEATURES.filter((feature) => !device.features.has(feature));
  if (missingFeatures.length === 0) {
    return;
  }
  throw new Error(
    `This GPUDevice cannot import camera frames on ${Platform.OS}: it is missing the ` +
      `${missingFeatures.map((feature) => `'${feature}'`).join(', ')} feature(s). ` +
      `Request your device with getRequiredWebGpuCameraFeatures() in GPUDeviceDescriptor.requiredFeatures, ` +
      `or omit the device option to use the shared device from useCameraWebGpuDevice().`,
  );
}

// The camera-import Metal features (external textures, multi-planar formats) aren't guaranteed
// before this iOS major version, so the /webgpu tier can fail on older devices even though it
// compiles. Best-effort heuristic; the real gate is assertWebGpuDeviceSupportsCameraImport.
const MIN_IOS_MAJOR_FOR_CAMERA_IMPORT = 17;
let hasWarnedUnsupportedIos = false;

/**
 * Emits a one-time console warning when running on an iOS version below the floor the camera-import
 * path needs (currently iOS {@link MIN_IOS_MAJOR_FOR_CAMERA_IMPORT}). On older versions device
 * acquisition or per-frame camera import can fail; this surfaces a clear reason before the more
 * cryptic device/feature error. No-op on Android and other platforms. {@link useCameraWebGpuDevice}
 * calls this for you.
 *
 * @group WebGPU
 */
export function warnIfIosVersionUnsupported(): void {
  if (hasWarnedUnsupportedIos || Platform.OS !== 'ios') {
    return;
  }
  const iosMajor = parseInt(String(Platform.Version), 10);
  if (Number.isNaN(iosMajor) || iosMajor >= MIN_IOS_MAJOR_FOR_CAMERA_IMPORT) {
    return;
  }
  hasWarnedUnsupportedIos = true;
  console.warn(
    `[react-native-vision-camera-source] The /webgpu camera tier needs iOS ${MIN_IOS_MAJOR_FOR_CAMERA_IMPORT}+ ` +
      `for Metal external-texture camera import, but this device runs iOS ${Platform.Version}. Camera import ` +
      `may fail here — use the base useVisionCameraSource tier, or gate /webgpu usage to iOS ` +
      `${MIN_IOS_MAJOR_FOR_CAMERA_IMPORT}+.`,
  );
}

/**
 * The pixel format of Fishjam output surfaces on this platform: `'rgba8unorm'` on Android
 * (AHardwareBuffer), `'bgra8unorm'` on iOS (IOSurface). Use it as the render-target format of any
 * pipeline that draws into the output texture — a mismatched format renders wrong or black.
 *
 * @group WebGPU
 */
export function getOutputSurfaceFormat(): GPUTextureFormat {
  return Platform.OS === 'android' ? 'rgba8unorm' : 'bgra8unorm';
}
