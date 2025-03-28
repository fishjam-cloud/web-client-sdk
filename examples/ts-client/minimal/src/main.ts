import { setupWhep } from "@fishjam-cloud/ts-client";

const video = document.getElementById("xD") as HTMLVideoElement;

const url =
  "https://cloud-two.fishjam.ovh/api/v1/connect/id/api/whep?inputId=ui";
const token = "tokenik";

const stream = await setupWhep(url, token);

video.srcObject = stream;
video.play();
