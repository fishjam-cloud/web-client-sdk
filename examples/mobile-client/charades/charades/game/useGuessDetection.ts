/**
 * Viewer-only speech-to-text guess detection, entirely on-device:
 *
 *   local microphone track ──(Fishjam audio extraction: 16 kHz mono f32
 *   batches)──▶ FSMN VAD utterance detection ──▶ whisper-tiny.en greedy
 *   transcription ──▶ pure phrase matcher ──▶ onPhraseGuessed (once per round)
 *
 * Implemented app-side on the react-native-executorch REWRITE's generic Model
 * API (see charades/game/speech/ — the released package's useSpeechToText does
 * not exist in the rewrite). The SAME microphone track that is published to
 * the room is tapped natively (`startAudioExtraction` works on local tracks),
 * so there is one capture and zero extra audio plumbing.
 *
 * The three model artifacts (~236 MB, dominated by whisper) download with the
 * hook — i.e. when the viewer screen opens, before the first round — and are
 * cached by the rewrite's useResourceDownload; detection itself only runs
 * while `enabled` (a round is active). All inference runs on the rewrite's
 * background worklet runtime, never on the JS thread.
 */
import { useMicrophone } from '@fishjam-cloud/react-native-client';
import { startAudioExtraction } from '@fishjam-cloud/react-native-webrtc';
import { useEffect, useRef, useState } from 'react';
import { useResourceDownload } from 'react-native-executorch';

import { phraseIsGuessed } from './phraseMatch';
import { createFsmnVad, type FsmnVad } from './speech/fsmnVad';
import { createUtteranceStream } from './speech/utteranceStream';
import {
  createWhisperTranscriber,
  type WhisperTranscriber,
} from './speech/whisperTranscriber';

const WHISPER_MODEL_URL =
  'https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en/resolve/v0.9.0/xnnpack/whisper_tiny_en_xnnpack_fp32.pte';
const WHISPER_TOKENIZER_URL =
  'https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en/resolve/v0.9.0/tokenizer.json';
const VAD_MODEL_URL =
  'https://huggingface.co/software-mansion/react-native-executorch-fsmn-vad/resolve/v0.9.0/xnnpack/fsmn_vad_xnnpack_fp32.pte';

// Download weights for the combined progress bar (artifact sizes in MB).
const WHISPER_DOWNLOAD_WEIGHT = 232 / 236;
const TOKENIZER_DOWNLOAD_WEIGHT = 2.3 / 236;
const VAD_DOWNLOAD_WEIGHT = 1.8 / 236;

interface SpeechModels {
  transcriber: WhisperTranscriber;
  voiceActivityDetector: FsmnVad;
}

export interface UseGuessDetectionOptions {
  /** True while this viewer should be listening (round is active). */
  enabled: boolean;
  /** The phrase to detect; null between rounds. */
  targetPhrase: string | null;
  /** Fired ONCE per round when the phrase is detected in the transcript. */
  onPhraseGuessed: () => void;
}

export interface UseGuessDetectionResult {
  modelReady: boolean;
  /** 0..1 while the speech model downloads on first use. */
  modelDownloadProgress: number;
  modelError: string | null;
  /** Rolling transcript of the current round (committed + tentative). */
  liveTranscript: string;
}

export function useGuessDetection(
  options: UseGuessDetectionOptions,
): UseGuessDetectionResult {
  const { enabled, targetPhrase, onPhraseGuessed } = options;

  const whisperDownload = useResourceDownload(WHISPER_MODEL_URL);
  const tokenizerDownload = useResourceDownload(WHISPER_TOKENIZER_URL);
  const vadDownload = useResourceDownload(VAD_MODEL_URL);
  const { microphoneStream } = useMicrophone();

  const [speechModels, setSpeechModels] = useState<SpeechModels | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  // The rolling transcript is tagged with the phrase it was heard for, so the
  // exposed transcript resets between rounds without any effect-time clearing.
  const [roundTranscript, setRoundTranscript] = useState<{
    phrase: string;
    text: string;
  } | null>(null);

  const onPhraseGuessedRef = useRef(onPhraseGuessed);
  useEffect(() => {
    onPhraseGuessedRef.current = onPhraseGuessed;
  });

  const whisperPath = whisperDownload.localPath;
  const tokenizerPath = tokenizerDownload.localPath;
  const vadPath = vadDownload.localPath;

  // --- Load the models once all three artifacts are on disk. ----------------
  useEffect(() => {
    if (!whisperPath || !tokenizerPath || !vadPath) {
      return;
    }
    let cancelled = false;
    let loadedModels: SpeechModels | null = null;
    const loadSpeechModels = async () => {
      const [transcriber, voiceActivityDetector] = await Promise.all([
        createWhisperTranscriber(whisperPath, tokenizerPath),
        createFsmnVad(vadPath),
      ]);
      loadedModels = { transcriber, voiceActivityDetector };
      if (cancelled) {
        transcriber.dispose();
        voiceActivityDetector.dispose();
        return;
      }
      console.log('[guess] speech models loaded');
      setSpeechModels(loadedModels);
    };
    loadSpeechModels().catch((error: unknown) => {
      console.warn('[guess] speech model load failed: ' + String(error));
      if (!cancelled) {
        setModelError(String(error));
      }
    });
    return () => {
      cancelled = true;
      setSpeechModels(null);
      loadedModels?.transcriber.dispose();
      loadedModels?.voiceActivityDetector.dispose();
    };
  }, [whisperPath, tokenizerPath, vadPath]);

  // --- Per-round detection: mic extraction -> VAD -> whisper -> matcher. ----
  useEffect(() => {
    if (!enabled || speechModels == null || !targetPhrase) {
      return;
    }
    const microphoneTrack = microphoneStream?.getAudioTracks()[0];
    if (!microphoneTrack) {
      return;
    }

    let guessAnnounced = false;

    console.log('[guess] detection starting', {
      targetPhrase,
      microphoneTrackId: microphoneTrack.id,
      microphoneTrackEnabled: microphoneTrack.enabled,
      microphoneTrackReadyState: microphoneTrack.readyState,
      microphoneTrackMuted: microphoneTrack.muted,
    });

    const utteranceStream = createUtteranceStream(
      speechModels.transcriber,
      speechModels.voiceActivityDetector,
      (transcript) => {
        setRoundTranscript({ phrase: targetPhrase, text: transcript });
        if (!guessAnnounced && phraseIsGuessed(targetPhrase, transcript)) {
          guessAnnounced = true;
          onPhraseGuessedRef.current();
        }
      },
    );

    // 16 kHz mono f32 batches — exactly the waveform format both models take.
    const stopAudioExtraction = startAudioExtraction(
      microphoneTrack,
      { sampleRate: 16000, channels: 1, format: 'f32', batchDurationMs: 100 },
      (batch) => {
        utteranceStream.insertAudio(new Float32Array(batch.data));
      },
    );

    return () => {
      stopAudioExtraction();
      utteranceStream.stop();
    };
  }, [enabled, speechModels, targetPhrase, microphoneStream]);

  const combinedDownloadProgress =
    (whisperDownload.downloadProgress * WHISPER_DOWNLOAD_WEIGHT +
      tokenizerDownload.downloadProgress * TOKENIZER_DOWNLOAD_WEIGHT +
      vadDownload.downloadProgress * VAD_DOWNLOAD_WEIGHT) /
    100;

  const downloadError =
    whisperDownload.downloadError ??
    tokenizerDownload.downloadError ??
    vadDownload.downloadError;

  const liveTranscript =
    roundTranscript != null && roundTranscript.phrase === targetPhrase
      ? roundTranscript.text
      : '';

  return {
    modelReady: speechModels != null,
    modelDownloadProgress: combinedDownloadProgress,
    modelError: modelError ?? (downloadError ? String(downloadError) : null),
    liveTranscript,
  };
}
