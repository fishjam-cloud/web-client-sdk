import { type ErrorRecoverability, FishjamError } from "./errors/FishjamError";

type BasicInfo = { id: string; name: string };

type RoomManagerResponse = {
  peerToken: string;
  url: string;
  room: BasicInfo;
  peer: BasicInfo;
};

type MoqAccessResponse = {
  connection_url: string;
  token: string;
};

export type MoqAccess = {
  connectionUrl: string;
  token: string;
};

export type RoomType = "conference" | "livestream" | "audio_only";

/** Thrown by the sandbox helpers when no sandboxApiUrl was provided. */
export class MissingSandboxApiUrlError extends FishjamError {
  public readonly recoverability: ErrorRecoverability = "user_action";

  public constructor() {
    super("A sandboxApiUrl is required, you can get it at: https://fishjam.io/app/sandbox");
    this.name = "MissingSandboxApiUrlError";
  }
}

const requireSandboxApiUrl = (sandboxApiUrl: string): string => {
  if (!sandboxApiUrl) throw new MissingSandboxApiUrlError();
  return sandboxApiUrl;
};

export const getSandboxPeerToken = async (
  sandboxApiUrl: string,
  roomName: string,
  peerName: string,
  roomType: RoomType = "conference",
): Promise<string> => {
  const url = new URL(requireSandboxApiUrl(sandboxApiUrl));
  url.searchParams.set("roomName", roomName);
  url.searchParams.set("peerName", peerName);
  url.searchParams.set("roomType", roomType);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to retrieve peer token for peer '${peerName}' in ${roomType} room '${roomName}'.`);
  }

  const data: RoomManagerResponse = await response.json();
  return data.peerToken;
};

export const getSandboxViewerToken = async (sandboxApiUrl: string, roomName: string): Promise<string> => {
  const url = new URL(`${requireSandboxApiUrl(sandboxApiUrl)}/${roomName}/livestream-viewer-token`);

  const response = await fetch(url);
  if (!response.ok) {
    let message = `Failed to retrieve viewer token for '${roomName}' livestream room.`;
    if (response.status === 404) {
      message = `A livestream room of name '${roomName}' does not exist.`;
    }
    throw new Error(message);
  }

  const data: { token: string } = await response.json();
  return data.token;
};

export const getSandboxLivestream = async (
  sandboxApiUrl: string,
  roomName: string,
  isPublic: boolean = false,
): Promise<{ streamerToken: string; room: BasicInfo }> => {
  const url = new URL(`${requireSandboxApiUrl(sandboxApiUrl)}/livestream`);
  url.searchParams.set("roomName", roomName);
  url.searchParams.set("public", isPublic.toString());

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to retrieve streamer token for '${roomName}' livestream room.`);

  return response.json();
};

const fetchMoqAccess = async (
  sandboxApiUrl: string,
  streamName: string,
  type: "subscriber" | "publisher",
): Promise<MoqAccess> => {
  const urlEncodedStreamName = encodeURIComponent(streamName);

  const response = await fetch(`${requireSandboxApiUrl(sandboxApiUrl)}/moq/${urlEncodedStreamName}/${type}`);
  if (!response.ok) throw new Error(`Failed to retrieve MoQ ${type} connection for stream '${streamName}'.`);

  const data: MoqAccessResponse = await response.json();
  return { connectionUrl: data.connection_url, token: data.token };
};

export const getSandboxMoqPublisherAccess = (sandboxApiUrl: string, streamName: string): Promise<MoqAccess> =>
  fetchMoqAccess(sandboxApiUrl, streamName, "publisher");

export const getSandboxMoqSubscriberAccess = (sandboxApiUrl: string, streamName: string): Promise<MoqAccess> =>
  fetchMoqAccess(sandboxApiUrl, streamName, "subscriber");
