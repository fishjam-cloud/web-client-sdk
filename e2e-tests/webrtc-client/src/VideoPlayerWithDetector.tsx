import type { WebRTCEndpoint } from "@fishjam-cloud/ts-client";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Pixel } from "./mocks";
import { getPixel } from "./mocks";

type Props = {
  stream?: MediaStream;
  id?: string;
  webrtc: WebRTCEndpoint;
};

const rgbToText = (pixel: Pixel): string => {
  const { red, green, blue } = pixel;
  if (red > 200 && green > 200 && blue > 200) return "white";
  if (red < 55 && green < 55 && blue < 55) return "black";
  if (red > 200 && green < 55 && blue < 55) return "red";
  if (red < 55 && green > 200 && blue < 55) return "green";
  if (red < 55 && green < 55 && blue > 200) return "blue";

  return "unknown";
};

const getTrackIdentifierToInboundRtp = (
  stats: RTCStatsReport,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
): Record<string, any> => {
  const result: Record<string, object> = {};

  stats.forEach((report) => {
    if (report.type === "inbound-rtp") {
      result[report.trackIdentifier] = report;
    }
  });

  return result;
};

export const VideoPlayerWithDetector = ({ stream, id, webrtc }: Props) => {
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const [color, setColor] = useState<string>("");
  const [decodedFrames, setDecodedFrames] = useState<string>("");

  useEffect(() => {
    if (!videoElementRef.current) return;
    videoElementRef.current.srcObject = stream || null;
  }, [stream]);

  const getDecodedFrames = useCallback(async () => {
    const connection = webrtc?.["connectionManager"];
    if (!connection) return 0;

    const inbound = getTrackIdentifierToInboundRtp(await connection.getConnection().getStats());

    const trackId = stream?.getVideoTracks()?.[0]?.id ?? "";

    return inbound[trackId]?.framesDecoded ?? 0;
  }, [stream, webrtc]);

  useEffect(() => {
    const intervalId = setInterval(async () => {
      setDecodedFrames(await getDecodedFrames());
    }, 50);

    return () => {
      clearInterval(intervalId);
    };
  }, [getDecodedFrames, stream]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const videoElement = videoElementRef.current;
      if (!videoElement || videoElement.videoWidth === 0) return;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixel = getPixel(imageData.data, canvas.width, 10, 10);
      setColor(rgbToText(pixel));
    }, 50);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div>
      <div data-color-name={color}>{color}</div>
      <div>
        Decoded frames:
        <span data-decoded-frames={decodedFrames}>{decodedFrames}</span>
      </div>
      <video id={id} style={{ maxHeight: "90px" }} autoPlay playsInline controls={false} muted ref={videoElementRef} />
    </div>
  );
};
