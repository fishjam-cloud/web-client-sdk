export const findSender = (
  connection: RTCPeerConnection | undefined,
  trackId: string,
): RTCRtpSender =>
  connection!
    .getSenders()
    .find((sender) => sender.track && sender!.track!.id === trackId)!;
