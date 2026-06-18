import {
  startAudioExtraction,
  stopAudioExtraction,
} from '@fishjam-cloud/react-native-webrtc';
import type { MediaStreamTrack } from '@fishjam-cloud/react-native-webrtc';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FSMN_VAD, useSpeechToText } from 'react-native-executorch';

// WHISPER_TINY_EN defaults to a CoreML model on iOS, but that file isn't
// published at v0.9.0 (404). Hardcode the XNNPACK variant, which exists.
const WHISPER_BASE =
  'https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en/resolve/v0.9.0';
const WHISPER_TINY_EN_XNNPACK = {
  modelName: 'whisper-tiny-en' as const,
  isMultilingual: false,
  modelSource: `${WHISPER_BASE}/xnnpack/whisper_tiny_en_xnnpack_fp32.pte`,
  tokenizerSource: `${WHISPER_BASE}/tokenizer.json`,
};

/**
 * Transcribes a remote peer's audio on-device: extracts 16 kHz mono audio from
 * the track and feeds it to an executorch Whisper model for a live transcript.
 */
export function useRemoteTranscription(
  track: MediaStreamTrack | null | undefined,
) {
  const stt = useSpeechToText({ model: WHISPER_TINY_EN_XNNPACK, vad: FSMN_VAD });
  const [active, setActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const committedRef = useRef('');

  // Run the transcription stream while active and the model is ready.
  useEffect(() => {
    if (!active || !stt.isReady) {
      return;
    }
    let cancelled = false;
    committedRef.current = '';
    setTranscript('');

    (async () => {
      try {
        for await (const { committed, nonCommitted } of stt.stream({ useVAD: true })) {
          if (cancelled) {
            break;
          }
          committedRef.current += committed.text ?? '';
          setTranscript(committedRef.current + (nonCommitted.text ?? ''));
        }
      } catch (error) {
        console.warn('[transcribe] stream error', error);
      }
    })();

    return () => {
      cancelled = true;
      stt.streamStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stt.isReady]);

  // Feed the track's audio into the transcription stream.
  useEffect(() => {
    if (!active || !stt.isReady || !track) {
      return;
    }
    startAudioExtraction(
      track,
      { sampleRate: 16000, channels: 1, format: 'f32', batchDurationMs: 100 },
      (batch) => {
        const samples = new Float32Array(batch.data);
        if (samples.length > 0) {
          stt.streamInsert(samples);
        }
      },
    ).catch((error: unknown) => {
      console.warn('[transcribe] startAudioExtraction failed', error);
    });

    return () => {
      stopAudioExtraction(track);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stt.isReady, track]);

  const toggle = useCallback(() => setActive((prev) => !prev), []);

  return {
    active,
    toggle,
    transcript,
    isReady: stt.isReady,
    downloadProgress: stt.downloadProgress,
    error: stt.error,
  };
}
