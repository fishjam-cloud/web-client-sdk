import {
  createCustomAudioTrack,
  type CustomAudioTrackResult,
  type MediaStream,
  pushAudioSamples as pushAudioSamplesToTrack,
} from '@fishjam-cloud/react-native-webrtc';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCustomSource } from '../overrides/hooks';

const DEFAULT_SOURCE_ID = 'customAudioSource';
const DEFAULT_SAMPLE_RATE_HZ = 48000;
const DEFAULT_CHANNEL_COUNT = 1;

/**
 * Settings for {@link useCustomAudioSource}, fixed for the lifetime of a
 * streaming session (a `startStreaming`/`stopStreaming` pair).
 */
export interface UseCustomAudioSourceOptions {
  /**
   * Stable id identifying this custom source. Defaults to
   * `"customAudioSource"`.
   */
  sourceId?: string;
  /**
   * Sample rate of the PCM you will push, in hertz. Push whatever your source
   * produces natively — it is resampled downstream. Defaults to `48000`.
   */
  sampleRateHz?: number;
  /**
   * `1` for mono or `2` for interleaved stereo. Defaults to `1`.
   */
  channelCount?: 1 | 2;
}

export interface UseCustomAudioSourceResult {
  /** Whether the custom audio track is currently published. */
  isStreaming: boolean;
  /**
   * Create the custom audio track and publish it. Once this resolves, pushed
   * samples are streamed to the room. No-op when already streaming.
   */
  startStreaming: () => Promise<void>;
  /**
   * Unpublish and release the custom audio track. No-op when not streaming.
   */
  stopStreaming: () => Promise<void>;
  /**
   * Hand PCM to the published track. Call whenever your source produces
   * audio, with any chunk size — the track re-paces it into a continuous
   * stream, filling gaps with silence like a live microphone. `Float32Array`
   * samples are expected in `[-1, 1]`; `Int16Array` is taken as-is. Safe to
   * call anytime: samples pushed while not streaming are dropped.
   */
  pushAudioSamples: (samples: Float32Array | Int16Array) => void;
  /** The error that failed the last `startStreaming` or `stopStreaming` call, if any. */
  error: Error | null;
}

type StreamingSession = {
  created: CustomAudioTrackResult | null;
  cancelled: boolean;
};

function stopStreamTracks(stream: MediaStream) {
  try {
    stream.getTracks().forEach((track) => track.stop());
  } catch (cause) {
    console.warn('useCustomAudioSource: stopping tracks failed', cause);
  }
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

/**
 * Publish your own audio to Fishjam.
 *
 * Creates a custom audio track, publishes it, and cleans it up — you supply
 * the PCM from any source (a synthesizer, a decoder, an audio pipeline) via
 * `pushAudioSamples`. The published track behaves like a live microphone:
 * pauses in pushing are fine and play as silence. It is independent of
 * {@link useMicrophone} and does not involve the device microphone in any way —
 * publishing it does not trigger the recording permission.
 *
 * Remote peers receive the track with metadata type `"customAudio"`
 * (`usePeers` exposes it under `customAudioTracks`).
 *
 * ```tsx
 * const { startStreaming, stopStreaming, pushAudioSamples } = useCustomAudioSource();
 *
 * // e.g. from react-native-audio-api's AudioRecorder:
 * recorder.onAudioReady({ sampleRate: 48000, bufferLength: 4800, channelCount: 1 },
 *     ({ buffer }) => pushAudioSamples(buffer.getChannelData(0)));
 * ```
 *
 * Requires the New Architecture; `startStreaming` reports an error on the old
 * architecture.
 *
 * @group Hooks
 */
export function useCustomAudioSource(options?: UseCustomAudioSourceOptions): UseCustomAudioSourceResult {
  const sourceId = options?.sourceId ?? DEFAULT_SOURCE_ID;
  const sampleRateHz = options?.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ;
  const channelCount = options?.channelCount ?? DEFAULT_CHANNEL_COUNT;

  const { setStream } = useCustomSource(sourceId);
  // Read through a ref so start/stop/unmount always use the latest setStream
  // without retriggering their memoization when the provider re-renders.
  const setStreamRef = useRef(setStream);
  useEffect(() => {
    setStreamRef.current = setStream;
  });

  const sessionRef = useRef<StreamingSession | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startStreaming = useCallback(async () => {
    if (sessionRef.current) {
      return;
    }
    const session: StreamingSession = { created: null, cancelled: false };
    sessionRef.current = session;
    setError(null);
    try {
      const created = await createCustomAudioTrack({
        sampleRateHz,
        channelCount,
      });
      if (session.cancelled) {
        // Stopped (or unmounted) while creating — discard the just-built track.
        stopStreamTracks(created.stream);
        return;
      }
      session.created = created;
      await setStreamRef.current(created.stream);
      if (session.cancelled) {
        // stopStreaming already unpublished and released the track.
        return;
      }
      setIsStreaming(true);
    } catch (cause) {
      if (session.created) {
        stopStreamTracks(session.created.stream);
      }
      if (!session.cancelled) {
        sessionRef.current = null;
        setError(toError(cause));
      }
    }
  }, [sampleRateHz, channelCount]);

  const stopStreaming = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    session.cancelled = true;
    sessionRef.current = null;
    setIsStreaming(false);
    if (session.created) {
      try {
        await setStreamRef.current(null);
      } catch (cause) {
        setError(toError(cause));
      } finally {
        stopStreamTracks(session.created.stream);
      }
    }
  }, []);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      session.cancelled = true;
      sessionRef.current = null;
      const created = session.created;
      if (created) {
        // Unpublish before stopping the tracks, so a publish call still queued
        // behind other custom sources never runs on an already-stopped track.
        // Failures are ignored — the provider may be unmounting too and there
        // is no surface left to report to.
        setStreamRef
          .current(null)
          .catch(() => {})
          .finally(() => stopStreamTracks(created.stream));
      }
    },
    [],
  );

  const pushAudioSamples = useCallback((samples: Float32Array | Int16Array) => {
    const track = sessionRef.current?.created?.track;
    if (!track) {
      // Not streaming — drop, matching live-source semantics.
      return;
    }
    pushAudioSamplesToTrack(track, samples);
  }, []);

  return { isStreaming, startStreaming, stopStreaming, pushAudioSamples, error };
}
