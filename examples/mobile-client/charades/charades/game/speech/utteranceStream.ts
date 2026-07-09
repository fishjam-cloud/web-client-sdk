/**
 * Glues the microphone batches, the FSMN VAD, and the whisper transcriber into
 * a rolling transcript:
 *
 *   insertAudio(batch) ──▶ ring buffer (60 s of 16 kHz audio)
 *                      └─▶ VAD (charades/game/speech/fsmnVad.ts)
 *   VAD utterance end ──▶ slice [start − 0.5 s, end + 0.3 s] from the ring
 *                         (capped at 29 s) ──▶ whisper transcription
 *                     ──▶ transcript += " " + utterance text ──▶ callback
 *
 * Utterances that end while a transcription is still in flight are queued, not
 * dropped (the transcriber serializes calls internally; appends happen in
 * completion order, which matches utterance order).
 */
import type { DetectedUtterance, FsmnVad } from './fsmnVad';
import {
  MAXIMUM_UTTERANCE_SAMPLES,
  type WhisperTranscriber,
} from './whisperTranscriber';

const SAMPLE_RATE = 16000;
const RING_CAPACITY_SAMPLES = 60 * SAMPLE_RATE;
const UTTERANCE_LEAD_SAMPLES = Math.round(0.5 * SAMPLE_RATE);
const UTTERANCE_TRAIL_SAMPLES = Math.round(0.3 * SAMPLE_RATE);

export interface UtteranceStream {
  /** Feeds the next microphone batch (16 kHz mono f32). */
  insertAudio(samples: Float32Array): void;
  /**
   * Stops consuming audio and firing callbacks; in-flight transcriptions are
   * abandoned. The stream cannot be restarted — create a new one per round.
   */
  stop(): void;
}

export function createUtteranceStream(
  transcriber: WhisperTranscriber,
  voiceActivityDetector: FsmnVad,
  onTranscriptUpdated: (transcript: string) => void,
): UtteranceStream {
  const ring = new Float32Array(RING_CAPACITY_SAMPLES);
  /** Total samples ever written; ring holds the last RING_CAPACITY_SAMPLES. */
  let totalSamplesWritten = 0;
  let transcript = '';
  let stopped = false;

  const writeToRing = (samples: Float32Array) => {
    for (
      let sourceOffset = 0;
      sourceOffset < samples.length;
      sourceOffset += 1
    ) {
      ring[(totalSamplesWritten + sourceOffset) % RING_CAPACITY_SAMPLES] =
        samples[sourceOffset];
    }
    totalSamplesWritten += samples.length;
  };

  const sliceFromRing = (
    startSample: number,
    endSample: number,
  ): Float32Array => {
    const oldestAvailable = Math.max(
      0,
      totalSamplesWritten - RING_CAPACITY_SAMPLES,
    );
    const clampedStart = Math.max(startSample, oldestAvailable);
    const clampedEnd = Math.min(endSample, totalSamplesWritten);
    const length = Math.max(0, clampedEnd - clampedStart);
    const slice = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      slice[index] = ring[(clampedStart + index) % RING_CAPACITY_SAMPLES];
    }
    return slice;
  };

  const handleUtterance = (utterance: DetectedUtterance) => {
    if (stopped) {
      return;
    }
    const { startSample, endSample } = utterance;
    const sliceStart = startSample - UTTERANCE_LEAD_SAMPLES;
    const sliceEnd = Math.min(
      endSample + UTTERANCE_TRAIL_SAMPLES,
      sliceStart + MAXIMUM_UTTERANCE_SAMPLES,
    );
    const waveform = sliceFromRing(sliceStart, sliceEnd);
    if (waveform.length === 0) {
      return;
    }
    console.log('[guess] utterance detected', {
      seconds: Number((waveform.length / SAMPLE_RATE).toFixed(2)),
      startSample,
      endSample,
    });
    transcriber
      .transcribeUtterance(waveform)
      .then((utteranceText) => {
        if (stopped) {
          return;
        }
        console.log('[guess] utterance transcribed: ' + utteranceText);
        const trimmed = utteranceText.trim();
        if (trimmed.length === 0) {
          return;
        }
        transcript = transcript.length === 0 ? trimmed : `${transcript} ${trimmed}`;
        onTranscriptUpdated(transcript);
      })
      .catch((error: unknown) => {
        if (!stopped) {
          console.warn('[guess] transcription failed: ' + String(error));
        }
      });
  };

  const insertAudio = (samples: Float32Array) => {
    if (stopped) {
      return;
    }
    writeToRing(samples);
    voiceActivityDetector.appendAudio(samples);
  };

  const stop = () => {
    stopped = true;
    voiceActivityDetector.setUtteranceCallback(null);
    voiceActivityDetector.reset();
  };

  // The VAD instance is shared across rounds; bind its utterance events to
  // this stream for the stream's lifetime (stop() unbinds).
  voiceActivityDetector.reset();
  voiceActivityDetector.setUtteranceCallback(handleUtterance);

  return { insertAudio, stop };
}
