import { setupWhep } from "@fishjam-cloud/ts-client";

async function setupWhepBroadcast() {
  const video = document.getElementById("xD") as HTMLVideoElement;

  const url =
    "https://cloud-two.fishjam.ovh/api/v1/connect/id/api/whep?inputId=ui";
  const token = "tokenik";

  const result = await setupWhep(url, token);

  video.srcObject = result.stream;
  video.play();
}

setupWhepBroadcast();
