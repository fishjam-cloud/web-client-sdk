import {
  addAudioDataListener,
  startAudioExtraction,
  stopAudioExtraction,
} from '@fishjam-cloud/react-native-webrtc';
import type { MediaStreamTrack } from '@fishjam-cloud/react-native-webrtc';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FSMN_VAD, useSpeechToText } from 'react-native-executorch';

import { audioTrackDataToFloat32 } from '../utils/audioPcm';

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
 * Transcribes a remote peer's audio track on-device.
 *
 * Pipeline: WebRTC sink → `audioTrackData` events → 16 kHz mono Float32
 * (audioPcm util) → executorch Whisper `streamInsert` → live transcript.
 */
export function useRemoteTranscription(
  track: MediaStreamTrack | null | undefined,
) {
  const stt = useSpeechToText({ model: WHISPER_TINY_EN_XNNPACK, vad: FSMN_VAD });
  const [active, setActive] = useState(false);
  const [transcript, setTranscript] = useState('');
  const committedRef = useRef('');

  // Drive the streaming generator while active and the model is ready.
  useEffect(() => {
    if (!active || !stt.isReady) {
      return;
    }
    let cancelled = false;
    committedRef.current = '';
    setTranscript('');

    (async () => {
      try {
        for await (const { committed, nonCommitted } of stt.stream({
          useVAD: true,
        })) {
          if (cancelled) {
            break;
          }
          if (committed.text) {
            committedRef.current += committed.text;
          }
          setTranscript(committedRef.current + (nonCommitted.text ?? ''));
        }
      } catch (e) {
        console.warn('[transcribe] stream error', e);
      }
    })();

    return () => {
      cancelled = true;
      stt.streamStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stt.isReady]);

  // Feed extracted PCM into the stream while active and ready.
  useEffect(() => {
    if (!active || !stt.isReady || !track) {
      return;
    }
    startAudioExtraction(track);
    const unsubscribe = addAudioDataListener(track, (data) => {
      const waveform = audioTrackDataToFloat32(data);
      if (waveform.length > 0) {
        stt.streamInsert(waveform);
      }
    });

    return () => {
      unsubscribe();
      stopAudioExtraction(track);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stt.isReady, track]);

  // Diagnostics for the model lifecycle (POC).
  useEffect(() => {
    console.log(
      `[transcribe] downloadProgress=${Math.round(stt.downloadProgress * 100)}%`,
    );
  }, [stt.downloadProgress]);
  useEffect(() => {
    if (stt.isReady) {
      console.log('[transcribe] model READY');
    }
  }, [stt.isReady]);
  useEffect(() => {
    if (stt.error) {
      console.log('[transcribe] model ERROR:', String(stt.error));
    }
  }, [stt.error]);

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
