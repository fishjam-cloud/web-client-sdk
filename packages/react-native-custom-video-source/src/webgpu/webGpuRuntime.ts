import { WebGPUModule } from 'react-native-webgpu';

/** The react-native-webgpu runtime singleton (the `RNWebGPU` JSI global). */
export type WebGpuRuntime = typeof RNWebGPU;

/**
 * Returns the react-native-webgpu runtime singleton, self-healing when the `RNWebGPU` global is
 * missing on the calling runtime. The library binds the global once at module load, but that
 * binding can be absent after a crash-recovery runtime reload or an install-ordering flake;
 * `WebGPUModule.install()` binds it to the calling runtime and is safe to repeat.
 */
export function getWebGpuRuntime(): WebGpuRuntime {
  if (typeof RNWebGPU === 'undefined') {
    const installedOk = WebGPUModule.install();
    console.warn(
      `react-native-custom-video-source: the RNWebGPU global was missing on this runtime; ` +
        `re-ran install() -> ${String(installedOk)}`,
    );
  }
  return RNWebGPU;
}
