import { WebRTCEndpoint } from '@fishjam-dev/ts-client';
import { brain2Mock, heart2Mock } from './MockComponent';
import { useEffect, useState } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { WebRTCEndpointEvents } from '../../../src';
import { EndpointMetadata, TrackMetadata } from './App';

type Props = {
  webrtc: WebRTCEndpoint;
};

export const MuteTrackTest = ({ webrtc }: Props) => {
  const [currentStream, setCurrentStream] = useState<MediaStream | null>();
  const [currentTrack, setCurrentTrack] = useState<MediaStreamTrack | null>();
  const [trackId, setTrackId] = useState<string | null>(null);

  useEffect(() => {
    const localTrackAdded: WebRTCEndpointEvents<
      EndpointMetadata,
      TrackMetadata
    >['localTrackAdded'] = (event) => {
      setCurrentStream(event.stream);
      setCurrentTrack(event.track);
      setTrackId(event.trackId);
    };

    const localTrackReplaced: WebRTCEndpointEvents<
      EndpointMetadata,
      TrackMetadata
    >['localTrackReplaced'] = (event) => {
      setCurrentTrack(event.track);
    };

    webrtc.on('localTrackAdded', localTrackAdded);
    webrtc.on('localTrackReplaced', localTrackReplaced);

    return () => {
      webrtc.removeListener('localTrackAdded', localTrackAdded);
      webrtc.removeListener('localTrackReplaced', localTrackReplaced);
    };
  }, [webrtc]);

  const addTrack = async (stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];

    if (!track) throw Error("Stream doesn't have any track");

    await webrtc.addTrack(
      track,
      { goodTrack: 'camera' },
      {
        enabled: true,
        activeEncodings: ['l', 'm', 'h'],
        disabledEncodings: [],
      },
    );
  };

  const replaceTrack = async (
    trackId: string | null,
    stream: MediaStream | null,
    track: MediaStreamTrack | null,
  ) => {
    if (!trackId) throw Error('Track id is null');

    await webrtc.replaceTrack(trackId, track);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '8px',
        borderStyle: 'dotted',
        borderWidth: '1px',
        borderColor: 'black',
      }}>
      <div>
        <span>track: {currentTrack?.id ?? 'null'}</span>
      </div>
      <div>
        <button
          disabled={!!currentStream || !!trackId}
          onClick={() => addTrack(heart2Mock.stream)}>
          Add heart
        </button>
        <button
          disabled={!!currentStream || !!trackId}
          onClick={() => addTrack(brain2Mock.stream)}>
          Add brain
        </button>
        <button
          onClick={() =>
            replaceTrack(
              trackId,
              heart2Mock.stream,
              heart2Mock.stream.getVideoTracks()[0],
            )
          }>
          Replace with heart
        </button>
        <button
          onClick={() =>
            replaceTrack(
              trackId,
              brain2Mock.stream,
              brain2Mock.stream.getVideoTracks()[0],
            )
          }>
          Replace with brain
        </button>
        <button onClick={() => replaceTrack(trackId, null, null)}>
          Mute track
        </button>
      </div>

      <div>{currentStream && <VideoPlayer stream={currentStream} />}</div>
    </div>
  );
};
