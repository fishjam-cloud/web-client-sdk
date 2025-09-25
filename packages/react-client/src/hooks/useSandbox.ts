import { useFishjamId } from "../contexts/fishjamId";
import { resolveFishjamUrl } from "../utils/fishjamUrl";

type BasicInfo = { id: string; name: string };
type RoomManagerResponse = {
  peerToken: string;
  url: string;
  room: BasicInfo;
  peer: BasicInfo;
};

export type UseSandboxProps = {
  // overrides the default URL derived from the `fishjamId` prop of `FishjamProvider`
  configOverride?: { sandboxApiUrl?: string };
};

export type RoomType = "conference" | "livestream" | "audio_only";

export const useSandbox = (props?: UseSandboxProps) => {
  const fishjamId = useFishjamId();

  const fishjamUrl = resolveFishjamUrl(fishjamId);

  const sandboxApiUrl = props?.configOverride?.sandboxApiUrl ?? `${fishjamUrl}/room-manager`;

  const getSandboxPeerToken = async (roomName: string, peerName: string, roomType: RoomType = "conference") => {
    const url = new URL(sandboxApiUrl);
    url.searchParams.set("roomName", roomName);
    url.searchParams.set("peerName", peerName);
    url.searchParams.set("roomType", roomType);

    const res = await fetch(url);

    if (!res.ok) {
      const message = `Failed to retrieve peer token for peer '${peerName}' in ${roomType} room '${roomName}'.`;
      throw new Error(message);
    }

    const data: RoomManagerResponse = await res.json();
    return data.peerToken;
  };

  const getSandboxViewerToken = async (roomName: string) => {
    const url = new URL(`${sandboxApiUrl}/${roomName}/livestream-viewer-token`);

    const res = await fetch(url);
    if (!res.ok) {
      let message = `Failed to retrieve viewer token for '${roomName}' livestream room.`;
      if (res.status === 404) {
        message = `A livestream room of name '${roomName}' does not exist.`;
      }
      throw new Error(message);
    }
    const data: { token: string } = await res.json();

    return data.token;
  };

  const getSandboxLivestream = async (roomName: string, isPublic: boolean = false) => {
    const url = new URL(`${sandboxApiUrl}/livestream`);
    url.searchParams.set("roomName", roomName);
    url.searchParams.set("public", isPublic.toString());

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to retrieve streamer token for '${roomName}' livestream room.`);

    const data: { streamerToken: string; room: { id: string; name: string } } = await res.json();
    return data;
  };

  return { getSandboxPeerToken, getSandboxViewerToken, getSandboxLivestream };
};
