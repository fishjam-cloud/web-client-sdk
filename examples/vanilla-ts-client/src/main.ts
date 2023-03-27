import "./style.css";
import { JellyfishClient } from "../../../src/jellyfish/JellyfishClient";
import { createStream } from "./createMockStream";
import { enumerateDevices } from "../../../src/navigator";
import { getUserMedia } from "../../../src/navigator";
import { Peer } from "@jellyfish-dev/membrane-webrtc-js";

const roomIdInput = document.querySelector<HTMLInputElement>("#room-id-input")!;
const peerIdInput = document.querySelector<HTMLInputElement>("#peer-id-input")!;
const peerNameInput = document.querySelector<HTMLInputElement>("#peer-name-input")!;
const connectButton = document.querySelector<HTMLButtonElement>("#connect-btn")!;
const disconnectButton = document.querySelector<HTMLButtonElement>("#disconnect-btn")!;
const addTrackButton = document.querySelector<HTMLButtonElement>("#add-track-btn")!;
const removeTrackButton = document.querySelector<HTMLButtonElement>("#remove-track-btn")!;
const localVideo = document.querySelector<HTMLVideoElement>("#local-track-video")!;
const enumerateDevicesButton = document.querySelector<HTMLVideoElement>("#enumerate-devices-btn")!;

const stream = createStream("🧪", "black", 24).stream;
localVideo.srcObject = stream;
let remoteTrakcId: string | null = null;
localVideo.play();

const ROOM_ID_LOCAL_STORAGE_ID = "roomId";
const PEER_ID_LOCAL_STORAGE_ID = "peerId";
const PEER_NAME_LOCAL_STORAGE_ID = "peerName";
roomIdInput.value = localStorage.getItem(ROOM_ID_LOCAL_STORAGE_ID) || "";
peerIdInput.value = localStorage.getItem(PEER_ID_LOCAL_STORAGE_ID) || "";
peerNameInput.value = localStorage.getItem(PEER_NAME_LOCAL_STORAGE_ID) || "";

roomIdInput.addEventListener("input", (event: any) => {
  localStorage.setItem(ROOM_ID_LOCAL_STORAGE_ID, event.target.value);
});
peerIdInput.addEventListener("input", (event: any) => {
  localStorage.setItem(PEER_ID_LOCAL_STORAGE_ID, event.target.value);
});
peerNameInput.addEventListener("input", (event: any) => {
  localStorage.setItem(PEER_NAME_LOCAL_STORAGE_ID, event.target.value);
});

const TrackTypeValues = ["screensharing", "camera", "audio"] as const;
export type TrackType = (typeof TrackTypeValues)[number];

export type PeerMetadata = {
  name: string;
};
export type TrackMetadata = {
  type: TrackType;
  active: boolean;
};

const client = new JellyfishClient<PeerMetadata, TrackMetadata>();

client.on("onJoinSuccess", (_peerId, peersInRoom) => {
  console.log("Join success!");
  const template = document.querySelector("#remote-peer-template-card")!;
  const remotePeers = document.querySelector("#remote-peers")!;

  (peersInRoom || []).forEach((peer: Peer) => {
    // @ts-ignore
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector(".card");
    card.dataset.peerId = peer.id;

    const peerId = clone.querySelector(".remote-peer-template-id");
    peerId.innerHTML = peer.id;

    remotePeers.appendChild(clone);
  });
});
client.on("onJoinError", (_metadata) => {});
client.on("onRemoved", (_reason) => {});
client.on("onPeerJoined", (peer) => {
  console.log("Join success!");
  const template = document.querySelector("#remote-peer-template-card")!;
  const remotePeers = document.querySelector("#remote-peers")!;

  // @ts-ignore
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector(".card");
  card.dataset.peerId = peer.id;

  const peerId = clone.querySelector(".remote-peer-template-id");
  peerId.innerHTML = peer.id;

  remotePeers.appendChild(clone);
});
client.on("onPeerUpdated", (_peer) => {});
client.on("onPeerLeft", (_peer) => {});
client.on("onTrackReady", (ctx) => {
  console.log("On track ready");
  const peerId = ctx.peer.id;
  const peerComponent = document.querySelector(`div[data-peer-id="${peerId}"`)!;
  const videoPlayer: HTMLVideoElement = peerComponent.querySelector(".remote-peer-template-video")!;

  videoPlayer.srcObject = ctx.stream;
  videoPlayer.play();
  console.log(peerComponent);
});

client.on("onTrackAdded", (ctx) => {
  ctx.on("onEncodingChanged", () => {});
  ctx.on("onVoiceActivityChanged", () => {});
});

client.on("onTrackRemoved", (_ctx) => {});
client.on("onTrackUpdated", (_ctx) => {});
client.on("onBandwidthEstimationChanged", (_estimation) => {});
client.on("onTrackEncodingChanged", (_peerId, _trackId, _encoding) => {});
client.on("onTracksPriorityChanged", (_enabledTracks, _disabledTracks) => {});

connectButton.addEventListener("click", () => {
  console.log("Connect");
  client.connect(roomIdInput.value, peerIdInput.value, { name: peerNameInput.value || "" }, false);
});

disconnectButton.addEventListener("click", () => {
  console.log("Disconnect");
  client.cleanUp();
});

const addTrack = (stream: MediaStream) => {
  console.log("Add track");
  const trackMetadata: TrackMetadata = {
    type: "camera",
    active: true,
  };
  const track = stream.getVideoTracks()[0];
  remoteTrakcId = client.webrtc?.addTrack(track, stream, trackMetadata) || null;
};

const removeTrack = () => {
  console.log("Remove track");
  remoteTrakcId && client.webrtc?.removeTrack(remoteTrakcId);
  remoteTrakcId = null;
};

addTrackButton.addEventListener("click", () => {
  addTrack(stream);
});

removeTrackButton.addEventListener("click", () => {
  removeTrack();
});

enumerateDevicesButton.addEventListener("click", () => {
  enumerateDevices(true, false).then((result) => {
    console.log(result);
    if (result.video.type !== "OK") return;
    const template = document.querySelector("#video-player-template")!;
    const videoPlayers = document.querySelector("#video-players")!;
    videoPlayers.innerHTML = "";
    result.video.devices.forEach((device) => {
      // @ts-ignore
      const clone = template.content.cloneNode(true);
      const videoPlayer = clone.querySelector(".video-player");

      clone.querySelector(".device-label").innerHTML = device.label;
      clone.querySelector(".device-id").innerHTML = device.deviceId;

      clone.querySelector(".start-template-btn").addEventListener("click", () => {
        console.log("Start");
        getUserMedia(device.deviceId, "video").then((stream) => {
          console.log("Connecting stream");
          videoPlayer.srcObject = stream;
          videoPlayer.play();
        });
      });
      clone.querySelector(".stop-template-btn").addEventListener("click", () => {
        console.log("Stop");
        const stream = videoPlayer.srcObject;
        stream.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
        });
        videoPlayer.srcObject = null;
      });

      clone.querySelector(".add-track-template-btn").addEventListener("click", () => {
        if (!videoPlayer.srcObject) return;

        addTrack(videoPlayer.srcObject);
      });

      clone.querySelector(".remove-track-template-btn").addEventListener("click", () => {
        removeTrack();
      });

      videoPlayers.appendChild(clone);
    });
  });
});
