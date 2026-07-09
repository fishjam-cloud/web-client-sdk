// Pull the standard WebGPU global types (GPUDevice, GPUBindGroup,
// GPUTextureFormat, GPUFeatureName, …) into scope. react-native-webgpu only
// *augments* these globals (e.g. adding importSharedTextureMemory to GPUDevice)
// and assumes the base declarations from @webgpu/types are already present.
/// <reference types="@webgpu/types" />
