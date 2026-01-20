import { RTCPeerConnection as OriginalRTCPeerConnection } from '@fishjam-cloud/react-native-webrtc';

export class RTCPeerConnection extends OriginalRTCPeerConnection {
  // TODO: FCE-2464 Replace with native side fetch
  private _configuration: RTCConfiguration;

  constructor(configuration?: RTCConfiguration) {
    super(configuration);
    this._configuration = configuration ?? {};
  }

  setConfiguration(configuration: RTCConfiguration): void {
    super.setConfiguration(configuration);
    this._configuration = configuration;
  }

  getConfiguration(): RTCConfiguration {
    return this._configuration;
  }
}
