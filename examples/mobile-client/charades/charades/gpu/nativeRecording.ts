/**
 * SETUP-vs-WORKLET BRIDGE (the crux of the RN port)
 * ============================================================================
 *
 * WHY THIS EXISTS
 * The TypeGPU example builds tgpu pipelines/bind-groups and dispatches them with
 * `pipeline.with(pass).with(bindGroup).dispatchWorkgroups(...)`. tgpu objects are
 * plain JS class instances that *wrap* react-native-webgpu NativeObjects — they
 * are NOT themselves NativeObjects, so the Worklets serializer cannot ship them
 * into the VisionCamera frame-processor worklet. Only raw NativeObjects
 * (GPUComputePipeline / GPUBindGroup / GPUTextureView / ...) + plain values can
 * cross that boundary.
 *
 * THE BRIDGE
 * On the JS thread we "record" what tgpu *would* issue against a real compute
 * pass: a `setPipeline(rawPipeline)` and a sequence of `setBindGroup(index,
 * rawBindGroup)` calls. tgpu's `applyBindGroups` already unwraps every tgpu bind
 * group to its raw `GPUBindGroup` and calls `pass.setBindGroup(index, raw)` — we
 * feed it a recording proxy that captures those raw objects + their group index,
 * then later REPLAY them verbatim in the worklet with native WebGPU calls. No
 * tgpu object ever crosses into the worklet.
 *
 * FRAME-DEPENDENT GROUPS
 * Three dispatches sample the per-frame camera external texture (preprocess,
 * bilateral upsample, composite render). That bind group can only be built in
 * the worklet (the external texture exists only there, only until the next
 * submit). For those we record the *static* groups, learn the total group count
 * from the pipeline, and the single remaining index is where the worklet must
 * bind the freshly-built external-texture group. We also capture the raw
 * `GPUBindGroupLayout` (via `root.unwrap(layout)`) so the worklet can
 * `device.createBindGroup({ layout, entries })` per frame.
 */
import type {
  TgpuRoot,
  TgpuComputePipeline,
  TgpuBindGroupLayout,
  TgpuRenderPipeline,
  TgpuBindGroup,
} from 'typegpu';
import { MissingBindGroupsError } from 'typegpu';

// Ported alongside the recorders from the example's `inference/kernels/types.ts`:
// the per-dispatch handle produced by the CNN kernel builders. Only `pipeline`
// and `bindGroup` are read by the recorders below.
interface KernelHandle {
  pipeline: TgpuComputePipeline;
  bindGroup: TgpuBindGroup;
  workgroups: number;
}

// A static (non-per-frame) bind group as raw natives + its group index.
export interface RecordedStaticGroup {
  index: number;
  bindGroup: GPUBindGroup;
}

// One compute dispatch flattened to raw natives, ready to replay in the worklet.
// `frameGroupIndex` is set ONLY for the preprocess + upsample dispatches: it is
// the group index the worklet must bind a freshly-built external-texture group
// to (everything else is already in `staticGroups`).
export interface RecordedComputeDispatch {
  pipeline: GPUComputePipeline;
  staticGroups: RecordedStaticGroup[];
  workgroupsX: number;
  workgroupsY: number;
  frameGroupIndex: number; // -1 when the dispatch has no external-texture group
}

// A recording proxy that satisfies the subset of GPUComputePassEncoder that
// tgpu's `_applyComputeState` + `dispatchWorkgroups` touch.
interface RecordingState {
  pipeline: GPUComputePipeline | null;
  groups: RecordedStaticGroup[];
}

function makeRecordingPass(state: RecordingState): GPUComputePassEncoder {
  // This proxy must satisfy tgpu 0.11.8's `isGPUComputePassEncoder` guard
  // (`core/pipeline/typeGuards.js`): `"dispatchWorkgroups" in value &&
  // !("beginRenderPass" in value)`. ONLY then does
  // `TgpuComputePipelineImpl.with(proxy)` store it as `priors.externalPass`,
  // so that `dispatchWorkgroups()` takes the external-pass branch of
  // `_executeComputePass` and runs `_applyComputeState(proxy)` against it
  // (`core/pipeline/computePipeline.js`). `_applyComputeState` calls
  // `proxy.setPipeline(memo.pipeline)` then `applyBindGroups(proxy, ...)`,
  // and `applyBindGroups` (`core/pipeline/applyPipelineState.js`) calls
  // `proxy.setBindGroup(index, rawGroup)` for every used layout — including
  // tgpu's auto-managed catchall group (uniforms/consts/slots) at its own
  // index. Finally `dispatch(proxy)` calls `proxy.dispatchWorkgroups(...)`.
  //
  // CRITICAL BUG THIS FIXES: the previous proxy had no `dispatchWorkgroups`,
  // so the guard failed, `.with(proxy)` mis-classified it (fell through to the
  // bind-group-layout-map branch), and `dispatchWorkgroups()` then created a
  // REAL command encoder + pass, applied state to THAT (not our proxy), and
  // submitted — so `setPipeline` was never seen here → the setup-time throw.
  //
  // We throw on any method tgpu's apply/dispatch path is NOT expected to call,
  // so a future tgpu internals change surfaces loudly at setup (JS thread)
  // rather than silently producing a wrong frame.
  const proxy = {
    setPipeline(pipeline: GPUComputePipeline) {
      state.pipeline = pipeline;
    },
    setBindGroup(index: number, bindGroup: GPUBindGroup) {
      state.groups.push({ index, bindGroup });
    },
    // Called last by tgpu's `dispatch(pass)`; no-op — we only want the bindings.
    dispatchWorkgroups() {},
    dispatchWorkgroupsIndirect() {},
    // tgpu may call these; they are no-ops for recording.
    pushDebugGroup() {},
    popDebugGroup() {},
    insertDebugMarker() {},
  } as unknown as GPUComputePassEncoder;
  return proxy;
}

/**
 * Records a tgpu compute dispatch into raw natives by replaying it against a
 * proxy pass. `staticBindGroups` are the dispatch's NON-frame bind groups (every
 * group for fully-static dispatches; all-but-the-frame-group for the two
 * external-texture dispatches). `frameLayout`, when present, lets us learn the
 * frame group's index without binding it.
 */
export function recordComputeDispatch(
  root: TgpuRoot,
  handle: Pick<KernelHandle, 'pipeline'> & {
    pipeline: TgpuComputePipeline;
  },
  staticBindGroups: KernelHandle['bindGroup'][],
  workgroups: { x: number; y?: number },
  options?: { frameLayout?: TgpuBindGroupLayout; expectedGroupCount?: number },
): RecordedComputeDispatch {
  const state: RecordingState = { pipeline: null, groups: [] };
  const proxyPass = makeRecordingPass(state);

  // Build the tgpu dispatch chain bound to the proxy pass + the static groups,
  // then dispatch — tgpu issues setPipeline + setBindGroup(index, rawGroup) for
  // each, which the proxy records. (Identical call shape to the example's
  // `handle.pipeline.with(pass).with(handle.bindGroup).dispatchWorkgroups(n)`.)
  let chain = handle.pipeline.with(proxyPass);
  for (const group of staticBindGroups) {
    chain = chain.with(group);
  }
  // For a frame-dependent dispatch the external-texture group is deliberately
  // NOT supplied, so tgpu's `applyBindGroups` records every OTHER group (static
  // + catchall) via the proxy and THEN throws `MissingBindGroupsError`. That
  // specific throw is expected — we already have what we need (setPipeline + all
  // non-frame setBindGroups). Any OTHER error (or a `MissingBindGroupsError` on
  // a fully-static dispatch) means our supplied groups are wrong or tgpu's
  // internals changed, so we let it surface at setup time on the JS thread.
  try {
    chain.dispatchWorkgroups(workgroups.x, workgroups.y ?? 1);
  } catch (error) {
    const isExpectedFrameGroupMiss =
      options?.frameLayout !== undefined &&
      error instanceof MissingBindGroupsError;
    if (!isExpectedFrameGroupMiss) {
      throw error;
    }
  }

  if (!state.pipeline) {
    throw new Error(
      'recordComputeDispatch: tgpu did not call setPipeline (internals changed?)',
    );
  }

  let frameGroupIndex = -1;
  if (options?.frameLayout) {
    // The frame group is the single index in [0, total) not covered by the
    // recorded static groups. `expectedGroupCount` must equal the pipeline's
    // total bind-group count (static groups + 1 frame group).
    const total = options.expectedGroupCount ?? state.groups.length + 1;
    const used = new Set(state.groups.map((g) => g.index));
    for (let index = 0; index < total; index++) {
      if (!used.has(index)) {
        frameGroupIndex = index;
        break;
      }
    }
    if (frameGroupIndex < 0) {
      throw new Error(
        'recordComputeDispatch: could not locate the external-texture group index',
      );
    }
  }

  return {
    pipeline: state.pipeline,
    staticGroups: state.groups,
    workgroupsX: workgroups.x,
    workgroupsY: workgroups.y ?? 1,
    frameGroupIndex,
  };
}

// ---------------------------------------------------------------------------
// Render-dispatch recording. Mirrors `recordComputeDispatch` but drives the
// render pipeline's `withColorAttachment(...).draw(3)` against a throwaway
// render pass so tgpu issues setPipeline + setBindGroup, which we capture. The
// composite render is replayed natively in the worklet against the IOSurface.
// ---------------------------------------------------------------------------

interface RecordedRenderDispatch {
  pipeline: GPURenderPipeline;
  staticGroups: { index: number; bindGroup: GPUBindGroup }[];
  frameGroupIndex: number;
}

export function recordRenderDispatch(
  root: TgpuRoot,
  pipeline: TgpuRenderPipeline,
  // The dispatch's NON-frame explicit bind groups (like `recordComputeDispatch`'s
  // `staticBindGroups`). The uniform + sampler are bound via tgpu's own
  // catch-all/uniform group, which tgpu resolves automatically and records as a
  // static group too — so callers only pass explicit groups here (empty for a
  // camera-only composite with no mask; the strokes group for the composite-with-
  // strokes).
  staticGroups: TgpuBindGroup[],
  // OPTIONAL. When DEFINED, the pipeline samples a per-frame external texture that
  // is bound in the worklet: tgpu records every OTHER group and then throws
  // `MissingBindGroupsError`, and we derive the single missing frame group index.
  // When UNDEFINED, the pipeline is FULLY STATIC (e.g. the brush pass, whose only
  // resource is its auto-bound uniform): the draw must SUCCEED and there is no
  // per-frame group, so we return `frameGroupIndex: -1`.
  frameLayout?: TgpuBindGroupLayout,
): RecordedRenderDispatch {
  const captured: {
    pipeline: GPURenderPipeline | null;
    groups: { index: number; bindGroup: GPUBindGroup }[];
  } = { pipeline: null, groups: [] };

  // A proxy carrying `executeBundles` + `draw` is recognized by tgpu as a
  // GPURenderPassEncoder, so `pipeline.with(proxy)` takes the external-render-
  // encoder path: tgpu calls `_applyRenderState(proxy)` (recording setPipeline +
  // each setBindGroup, including the auto-bound composite uniform "catch-all"
  // group) and then `proxy.draw(...)`. No real attachment / beginRenderPass is
  // needed. The per-frame external-texture group is intentionally NOT supplied,
  // so it surfaces as the one missing group index.
  const proxyRenderPass = {
    executeBundles() {},
    setPipeline(p: GPURenderPipeline) {
      captured.pipeline = p;
    },
    setBindGroup(index: number, bindGroup: GPUBindGroup) {
      captured.groups.push({ index, bindGroup });
    },
    setVertexBuffer() {},
    setIndexBuffer() {},
    setStencilReference() {},
    draw() {},
    pushDebugGroup() {},
    popDebugGroup() {},
    insertDebugMarker() {},
  } as unknown as GPURenderPassEncoder;

  // With a frameLayout, the external-texture group is intentionally absent, so
  // tgpu records the pipeline + static groups (the explicit `staticGroups` + the
  // auto-bound uniform catch-all) and then throws `MissingBindGroupsError` — the
  // ONLY expected throw. WITHOUT a frameLayout the pipeline is fully static, so
  // the draw must SUCCEED and ANY error is real. Either way, any other error
  // means our supplied groups / tgpu internals are wrong, so we surface it at
  // setup time on the JS thread.
  try {
    let chain = pipeline.with(proxyRenderPass);
    for (const group of staticGroups) {
      chain = chain.with(group);
    }
    chain.draw(3);
  } catch (error) {
    const isExpectedFrameGroupMiss =
      frameLayout !== undefined && error instanceof MissingBindGroupsError;
    if (!isExpectedFrameGroupMiss) {
      throw error;
    }
    // expected: missing external-texture group (bound per-frame in the worklet)
  }

  if (!captured.pipeline) {
    throw new Error('recordRenderDispatch: tgpu did not call setPipeline');
  }

  // Fully-static dispatch: every group was recorded, no per-frame group.
  if (frameLayout === undefined) {
    return {
      pipeline: captured.pipeline,
      staticGroups: captured.groups,
      frameGroupIndex: -1,
    };
  }

  // Frame-dependent dispatch: exactly one external-texture group is missing, so
  // the total group count is recordedCount + 1; the frame group is the single
  // uncovered index.
  const used = new Set(captured.groups.map((g) => g.index));
  const total = captured.groups.length + 1;
  let frameGroupIndex = -1;
  for (let index = 0; index < total; index++) {
    if (!used.has(index)) {
      frameGroupIndex = index;
      break;
    }
  }
  if (frameGroupIndex < 0) {
    throw new Error('recordRenderDispatch: could not locate external-texture group');
  }
  return { pipeline: captured.pipeline, staticGroups: captured.groups, frameGroupIndex };
}
