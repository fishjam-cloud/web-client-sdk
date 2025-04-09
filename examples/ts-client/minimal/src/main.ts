import { consumeBroadcast } from "@fishjam-cloud/ts-client";

async function setupBroadcast() {
  const video = document.getElementById("xD") as HTMLVideoElement;

  const url =
    "https://cloud-two.fishjam.ovh/api/v1/connect/id/api/whep?inputId=ui";
  const token = "tokenik";

  const result = await consumeBroadcast(url, token);

  video.srcObject = result.stream;
  video.play();
}

setupBroadcast();
