// Ambient module declaration so referencing a bundled model file type-checks:
// a static `require('.../model.pte')` OR an `import model from '.../model.pte'`.
//
// `.pte` = an ExecuTorch program. Metro bundles it as a binary app ASSET (see
// `metro.config.js` `resolver.assetExts`) and resolves it to an asset module id
// (a number) at runtime — the same mechanism the `.tflite` model weights use.
//
// Used by the charades ExecuTorch hand-tracking backend; see
// `charades/hand/executorch/`.
declare module '*.pte' {
  const asset: number;
  export default asset;
}
