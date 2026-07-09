/**
 * FSMN voice-activity detection on the react-native-executorch rewrite's
 * generic Model API, running incrementally on appended microphone audio.
 *
 * Preprocessing (ported from the validated desktop reference,
 * fsmn_vad_reference.py): 16 kHz waveform -> 400-sample frames at hop 160,
 * per-frame mean subtraction, pre-emphasis 0.97 (kaldi-style first sample),
 * Hann window (np.hanning(400) equivalent), each frame zero-padded to 512.
 * Model forward: f32 [1000, 512] (meta bound; unused rows stay zero) ->
 * f32 [1, 1000, 248] softmax rows; per-frame speech score = 1 − P(class 0).
 *
 * Frames are batched into fixed 30-frame chunks (300 ms) so every tensor
 * shape is static, and each chunk's forward runs on the rewrite's background
 * worklet runtime (wrapAsync): the model is tiny but the placeholder forward
 * covers the full 1000-frame bound, so keeping it off the JS thread costs one
 * ~60 KB argument copy per chunk and removes any UI-thread risk. That runtime
 * is shared with the whisper transcriber, so VAD chunks queue behind an
 * in-flight transcription — audio keeps accumulating in JS-side buffers and
 * nothing is lost, detection just resumes with a small delay.
 *
 * The segment state machine (thresholds from the reference): speech starts
 * after 25 consecutive frames above 0.6 (250 ms), ends after 40 consecutive
 * frames below (400 ms), and segment boundaries are padded by ±3 frames.
 * Utterances are reported in ABSOLUTE SAMPLE indices since start.
 */
import {
  loadModel,
  tensor,
  wrapAsync,
  type Model,
} from 'react-native-executorch';

const FRAME_LENGTH = 400;
const FRAME_HOP = 160;
const PADDED_FRAME_LENGTH = 512;
const PRE_EMPHASIS = 0.97;
const CLASS_COUNT = 248;

const CHUNK_FRAMES = 30;

const SPEECH_THRESHOLD = 0.6;
const SPEECH_START_FRAMES = 25;
const SPEECH_END_SILENCE_FRAMES = 40;
const SEGMENT_PADDING_FRAMES = 3;

export interface DetectedUtterance {
  /** Inclusive start, in absolute samples since the stream started. */
  startSample: number;
  /** Exclusive end, in absolute samples since the stream started. */
  endSample: number;
}

export interface FsmnVad {
  /** Feeds the next microphone batch (16 kHz mono f32). */
  appendAudio(samples: Float32Array): void;
  /**
   * Sets (or clears) the utterance listener. The VAD instance outlives the
   * per-round utterance streams, which rebind this on start/stop.
   */
  setUtteranceCallback(
    callback: ((utterance: DetectedUtterance) => void) | null,
  ): void;
  /** Clears all buffered audio and segment state. */
  reset(): void;
  dispose(): void;
}

/** np.hanning(length) equivalent. */
function buildHannWindow(length: number): Float32Array {
  const window = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
  }
  return window;
}

export async function createFsmnVad(modelPath: string): Promise<FsmnVad> {
  const model: Model = await wrapAsync(loadModel)(modelPath);

  const forwardMeta = model.getMethodMeta('forward');
  const inputShape = forwardMeta.inputTensorMeta[0].shape; // [1000, 512]
  if (inputShape[1] !== PADDED_FRAME_LENGTH || inputShape[0] < CHUNK_FRAMES) {
    throw new Error(
      `fsmn-vad model signature mismatch: input ${JSON.stringify(inputShape)}`,
    );
  }
  const stagedInputElements = inputShape[0] * PADDED_FRAME_LENGTH;
  const inputTensor = tensor('float32', inputShape);
  const outputTensor = tensor('float32', forwardMeta.outputTensorMeta[0].shape);
  const chunkScoresTensor = tensor('float32', [CHUNK_FRAMES * CLASS_COUNT]);

  const runVadChunkForward = (chunkFrames: Float32Array): number[] => {
    'worklet';
    // 512 = padded frame length, 248 = class count (module scope does not
    // exist in worklets; the canonical constants live at the top of the file).
    const chunkFrameCount = chunkFrames.length / 512;
    const staged = new Float32Array(stagedInputElements);
    staged.set(chunkFrames);
    inputTensor.setData(staged);
    model.execute('forward', [inputTensor], [outputTensor]);
    outputTensor.copyTo(chunkScoresTensor, {
      offset: 0,
      length: chunkFrameCount * 248,
    });
    const posteriorRows = chunkScoresTensor.getData(
      new Float32Array(chunkFrameCount * 248),
    );
    const speechScores: number[] = [];
    for (let frame = 0; frame < chunkFrameCount; frame += 1) {
      speechScores.push(1 - posteriorRows[frame * 248]);
    }
    return speechScores;
  };
  const runVadChunkForwardOffThread = wrapAsync(runVadChunkForward);

  const hannWindow = buildHannWindow(FRAME_LENGTH);

  // --- JS-side mutable state (frames, chunking, segment machine). -----------
  /** Unconsumed samples: hop remainder + lookahead for the next frame. */
  let pendingSamples = new Float32Array(0);
  /** Frames preprocessed but not yet dispatched (chunk fills to 30). */
  let chunkFrameRows: Float32Array[] = [];
  /** Absolute frame index of the next frame to be scored. */
  let nextScoredFrame = 0;
  /** Serializes chunk forwards so scores are consumed in frame order. */
  let forwardChain: Promise<void> = Promise.resolve();
  /** Bumped by reset() so in-flight chunk results from before it are ignored. */
  let resetEpoch = 0;
  let disposed = false;
  let utteranceCallback: ((utterance: DetectedUtterance) => void) | null = null;

  // Segment state machine.
  let inSpeech = false;
  let speechRunStartFrame = 0;
  let consecutiveSpeechFrames = 0;
  let consecutiveSilenceFrames = 0;
  let lastSpeechFrame = 0;

  const consumeFrameScore = (frameIndex: number, speechScore: number) => {
    const isSpeech = speechScore > SPEECH_THRESHOLD;
    if (!inSpeech) {
      consecutiveSpeechFrames = isSpeech ? consecutiveSpeechFrames + 1 : 0;
      if (consecutiveSpeechFrames >= SPEECH_START_FRAMES) {
        inSpeech = true;
        speechRunStartFrame = frameIndex - (SPEECH_START_FRAMES - 1);
        lastSpeechFrame = frameIndex;
        consecutiveSilenceFrames = 0;
      }
      return;
    }
    if (isSpeech) {
      lastSpeechFrame = frameIndex;
      consecutiveSilenceFrames = 0;
      return;
    }
    consecutiveSilenceFrames += 1;
    if (consecutiveSilenceFrames >= SPEECH_END_SILENCE_FRAMES) {
      const startFrame = Math.max(
        0,
        speechRunStartFrame - SEGMENT_PADDING_FRAMES,
      );
      const endFrame = lastSpeechFrame + SEGMENT_PADDING_FRAMES;
      inSpeech = false;
      consecutiveSpeechFrames = 0;
      consecutiveSilenceFrames = 0;
      utteranceCallback?.({
        startSample: startFrame * FRAME_HOP,
        endSample: endFrame * FRAME_HOP + FRAME_LENGTH,
      });
    }
  };

  const dispatchChunk = () => {
    const chunk = new Float32Array(CHUNK_FRAMES * PADDED_FRAME_LENGTH);
    for (let frame = 0; frame < CHUNK_FRAMES; frame += 1) {
      chunk.set(chunkFrameRows[frame], frame * PADDED_FRAME_LENGTH);
    }
    chunkFrameRows = [];
    const chunkFirstFrame = nextScoredFrame;
    nextScoredFrame += CHUNK_FRAMES;
    const chunkEpoch = resetEpoch;
    forwardChain = forwardChain
      .then(() => runVadChunkForwardOffThread(chunk))
      .then((speechScores) => {
        if (disposed || chunkEpoch !== resetEpoch) {
          return;
        }
        for (let frame = 0; frame < speechScores.length; frame += 1) {
          consumeFrameScore(chunkFirstFrame + frame, speechScores[frame]);
        }
      })
      .catch((error: unknown) => {
        console.warn('[guess] vad forward failed: ' + String(error));
      });
  };

  const appendAudio = (samples: Float32Array) => {
    if (disposed) {
      return;
    }
    const merged = new Float32Array(pendingSamples.length + samples.length);
    merged.set(pendingSamples);
    merged.set(samples, pendingSamples.length);
    pendingSamples = merged;

    // Extract every complete 400-sample frame at hop 160.
    let frameStart = 0;
    while (frameStart + FRAME_LENGTH <= pendingSamples.length) {
      const frameRow = new Float32Array(PADDED_FRAME_LENGTH);
      let mean = 0;
      for (let index = 0; index < FRAME_LENGTH; index += 1) {
        mean += pendingSamples[frameStart + index];
      }
      mean /= FRAME_LENGTH;
      // Pre-emphasis over the mean-subtracted frame; kaldi-style first sample
      // uses the frame's own first value as its predecessor.
      const firstSample = pendingSamples[frameStart] - mean;
      frameRow[0] = (firstSample - PRE_EMPHASIS * firstSample) * hannWindow[0];
      for (let index = 1; index < FRAME_LENGTH; index += 1) {
        const current = pendingSamples[frameStart + index] - mean;
        const previous = pendingSamples[frameStart + index - 1] - mean;
        frameRow[index] = (current - PRE_EMPHASIS * previous) * hannWindow[index];
      }
      chunkFrameRows.push(frameRow);
      if (chunkFrameRows.length === CHUNK_FRAMES) {
        dispatchChunk();
      }
      frameStart += FRAME_HOP;
    }
    pendingSamples = pendingSamples.slice(frameStart);
  };

  const reset = () => {
    resetEpoch += 1;
    pendingSamples = new Float32Array(0);
    chunkFrameRows = [];
    nextScoredFrame = 0;
    inSpeech = false;
    speechRunStartFrame = 0;
    consecutiveSpeechFrames = 0;
    consecutiveSilenceFrames = 0;
    lastSpeechFrame = 0;
  };

  const dispose = () => {
    disposed = true;
    // Native handles are lock-guarded; release them only after any in-flight
    // chunk forward has drained.
    void forwardChain.then(() => {
      inputTensor.dispose();
      outputTensor.dispose();
      chunkScoresTensor.dispose();
      model.dispose();
    });
  };

  const setUtteranceCallback = (
    callback: ((utterance: DetectedUtterance) => void) | null,
  ) => {
    utteranceCallback = callback;
  };

  return { appendAudio, setUtteranceCallback, reset, dispose };
}
