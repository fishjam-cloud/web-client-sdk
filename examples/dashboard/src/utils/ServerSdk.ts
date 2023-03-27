import axios from "axios";

const headers = { "Content-Type": "application/json" };

export class ServerRoomSdk {
  url: string;

  constructor(url?: string) {
    const baseUrl = url ?? "";
    this.url = `${baseUrl}/room`;
  }

  get(id?: string) {
    const url = id ? `${this.url}/${id}` : this.url;
    return axios.get(url);
  }

  create(maxPeers: number) {
    return axios.post(this.url, { maxPeers: maxPeers }, { headers });
  }

  remove(roomId: string) {
    return axios.delete(`${this.url}/${roomId}`);
  }

  addPeer(roomId: string, type: string) {
    return axios.post(
      `${this.url}/${roomId}/peer`,
      { type: type },
      { headers }
    );
  }

  removePeer(roomId: string, peerId: string) {
    return axios.delete(`${this.url}/${roomId}/peer/${peerId}`);
  }
}
