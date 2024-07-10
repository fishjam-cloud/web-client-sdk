export type TurnServer = {
  transport: string;
  password: string;
  serverAddr: string;
  serverPort: string;
  username: string;
};

/**
 * Configures TURN servers for WebRTC connections by adding them to the provided RTCConfiguration object.
 */
export const setTurns = (
  turnServers: TurnServer[],
  rtcConfig: RTCConfiguration,
): void => {
  turnServers
    .map((turnServer: TurnServer) => {
      const transport =
        turnServer.transport === 'tls' ? 'tcp' : turnServer.transport;
      const uri = turnServer.transport === 'tls' ? 'turns' : 'turn';
      const address = turnServer.serverAddr;
      const port = turnServer.serverPort;

      return {
        credential: turnServer.password,
        urls: uri.concat(':', address, ':', port, '?transport=', transport),
        username: turnServer.username,
      } satisfies RTCIceServer;
    })
    .forEach((rtcIceServer) => {
      rtcConfig.iceServers!.push(rtcIceServer);
    });
};
