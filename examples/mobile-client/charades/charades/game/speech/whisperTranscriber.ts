/**
 * Whisper-tiny.en utterance transcription on the react-native-executorch
 * REWRITE's generic Model API (the released package's useSpeechToText does not
 * exist in the rewrite).
 *
 * The exported `.pte` has two methods (verified against the desktop ExecuTorch
 * reference in the migration scouting):
 *
 *   encode  f32 [480000] raw 16 kHz mono waveform (mel baked in; the model
 *           zero-pads internally, so shorter utterances are staged into a
 *           zero-filled full window) -> f32 [1, 1500, 384]
 *   decode  (int64 [1,1] token, int64 [1] absolute cache position,
 *           f32 [1,1500,384] encoder output) -> f32 logits, [1,1,51864] per
 *           step inside a [1,128,51864] meta bound; internal KV cache,
 *           single-token steps, max 128 positions
 *
 * Greedy decode: seed tokens <|startoftranscript|> (50257) and <|0.00|> (50363)
 * at positions 0 and 1, then argmax per step until <|endoftext|> (50256) or
 * position 128. Tokens >= <|endoftext|> (specials + timestamps) are dropped
 * before detokenizing with the rewrite's built-in HuggingFace tokenizer.
 *
 * THREADING: the whole encode + decode loop + detokenize runs as ONE
 * worklet-marked function dispatched to the rewrite's background worklet
 * runtime (wrapAsync) — a single hop per utterance, never blocking the JS
 * thread for the 0.5–1s of inference. Calls are serialized through an internal
 * promise chain because Model.execute throws on concurrent use.
 *
 * int64 inputs: JS engines lack a portable BigInt64Array, but Tensor.setData
 * is a raw byte memcpy, so an Int32Array of [value, 0] little-endian words
 * encodes an int64 exactly (all whisper token ids < 2^31). Requires the int64
 * dtype patch (react-native-executorch+0.0.0.patch, backported from upstream
 * PR #1293).
 *
 * Every tensor (including the 26 MB logits placeholder — the execute API
 * requires output placeholders sized to the method's meta upper bound) is
 * preallocated once and reused; the encoder output Tensor is passed straight
 * back into decode with no JS readback, and per-step logits are read back via
 * copyTo into a small [51864] tensor instead of pulling the full placeholder.
 */
import {
  loadModel,
  nlp,
  tensor,
  wrapAsync,
  type Model,
} from 'react-native-executorch';

export const MAXIMUM_UTTERANCE_SAMPLES = 464000; // 29 s @ 16 kHz, < model max

const EXPECTED_ENCODER_OUTPUT_SHAPE = [1, 1500, 384];
const EXPECTED_VOCABULARY_SIZE = 51864;

export interface WhisperTranscriber {
  /**
   * Transcribes one utterance (16 kHz mono f32, at most
   * MAXIMUM_UTTERANCE_SAMPLES — longer input is truncated). Runs on the
   * background runtime; concurrent calls are serialized in call order.
   */
  transcribeUtterance(waveform: Float32Array): Promise<string>;
  dispose(): void;
}

function shapesEqual(actual: readonly number[], expected: number[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((dimension, index) => dimension === expected[index])
  );
}

export async function createWhisperTranscriber(
  modelPath: string,
  tokenizerPath: string,
): Promise<WhisperTranscriber> {
  const model: Model = await wrapAsync(loadModel)(modelPath);
  const tokenizer = await wrapAsync(nlp.loadTokenizer)(tokenizerPath);

  // Placeholder tensors must match the method metas EXACTLY (execute validates
  // shapes against the meta, which reports upper bounds for dynamic dims), so
  // size everything from the metas and assert the layout we ported against.
  const encodeMeta = model.getMethodMeta('encode');
  const decodeMeta = model.getMethodMeta('decode');
  const waveformCapacity = encodeMeta.inputTensorMeta[0].shape[0];
  const encoderOutputShape = encodeMeta.outputTensorMeta[0].shape;
  const logitsShape = decodeMeta.outputTensorMeta[0].shape;
  const vocabularySize = logitsShape[logitsShape.length - 1];
  if (
    !shapesEqual(encoderOutputShape, EXPECTED_ENCODER_OUTPUT_SHAPE) ||
    vocabularySize !== EXPECTED_VOCABULARY_SIZE ||
    waveformCapacity < MAXIMUM_UTTERANCE_SAMPLES
  ) {
    throw new Error(
      `whisper model signature mismatch: encode out ${JSON.stringify(encoderOutputShape)}, ` +
        `decode out ${JSON.stringify(logitsShape)}, waveform capacity ${waveformCapacity}`,
    );
  }

  const waveformTensor = tensor('float32', [waveformCapacity]);
  const encoderOutputTensor = tensor('float32', encoderOutputShape);
  const logitsTensor = tensor('float32', logitsShape);
  const stepLogitsTensor = tensor('float32', [vocabularySize]);
  const tokenTensor = tensor('int64', [1, 1]);
  const positionTensor = tensor('int64', [1]);

  const runTranscription = (waveform: Float32Array): string => {
    'worklet';
    // Token/loop constants inlined (module scope does not exist in worklets).
    const START_OF_TRANSCRIPT_TOKEN = 50257;
    const FIRST_TIMESTAMP_TOKEN = 50363;
    const END_OF_TEXT_TOKEN = 50256;
    const MAXIMUM_DECODE_POSITIONS = 128;

    const stagedWaveform = new Float32Array(waveformCapacity);
    stagedWaveform.set(waveform.subarray(0, waveformCapacity));
    waveformTensor.setData(stagedWaveform);
    model.execute('encode', [waveformTensor], [encoderOutputTensor]);

    const int64Scratch = new Int32Array(2);
    const stepLogits = new Float32Array(vocabularySize);
    const generatedTokens: number[] = [
      START_OF_TRANSCRIPT_TOKEN,
      FIRST_TIMESTAMP_TOKEN,
    ];
    let position = 0;
    let nextToken = 0;
    while (position < MAXIMUM_DECODE_POSITIONS) {
      const currentToken =
        position < generatedTokens.length ? generatedTokens[position] : nextToken;
      int64Scratch[0] = currentToken;
      int64Scratch[1] = 0;
      tokenTensor.setData(int64Scratch);
      int64Scratch[0] = position;
      positionTensor.setData(int64Scratch);
      model.execute(
        'decode',
        [tokenTensor, positionTensor, encoderOutputTensor],
        [logitsTensor],
      );
      // The step's [1,1,51864] logits are the first vocabularySize floats of
      // the meta-bound placeholder.
      logitsTensor.copyTo(stepLogitsTensor, { offset: 0, length: vocabularySize });
      stepLogitsTensor.getData(stepLogits);
      let bestToken = 0;
      let bestLogit = stepLogits[0];
      for (let index = 1; index < vocabularySize; index += 1) {
        if (stepLogits[index] > bestLogit) {
          bestLogit = stepLogits[index];
          bestToken = index;
        }
      }
      nextToken = bestToken;
      position += 1;
      if (position >= generatedTokens.length) {
        if (nextToken === END_OF_TEXT_TOKEN) {
          break;
        }
        generatedTokens.push(nextToken);
      }
    }

    // Drop specials + timestamps (every id >= <|endoftext|>).
    const textTokens: number[] = [];
    for (const token of generatedTokens) {
      if (token < END_OF_TEXT_TOKEN) {
        textTokens.push(token);
      }
    }
    return tokenizer.decode(textTokens, true);
  };

  const runTranscriptionOffThread = wrapAsync(runTranscription);

  // Model.execute throws on concurrent use — serialize calls in order.
  let transcriptionChain: Promise<unknown> = Promise.resolve();
  let disposed = false;
  const transcribeUtterance = (waveform: Float32Array): Promise<string> => {
    if (disposed) {
      return Promise.reject(new Error('transcriber disposed'));
    }
    const nextTranscription = transcriptionChain.then(() =>
      runTranscriptionOffThread(waveform),
    );
    transcriptionChain = nextTranscription.then(
      () => undefined,
      () => undefined,
    );
    return nextTranscription;
  };

  const dispose = () => {
    disposed = true;
    // Native handles are lock-guarded; release them only after any in-flight
    // transcription has drained.
    void transcriptionChain.then(() => {
      waveformTensor.dispose();
      encoderOutputTensor.dispose();
      logitsTensor.dispose();
      stepLogitsTensor.dispose();
      tokenTensor.dispose();
      positionTensor.dispose();
      tokenizer.dispose();
      model.dispose();
    });
  };

  return { transcribeUtterance, dispose };
}
