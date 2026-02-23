import {
  useLivestreamStreamer,
  useLivestreamViewer,
  useSandbox,
} from "@fishjam-cloud/react-client";
import { LivestreamError } from "@fishjam-cloud/ts-client";
import { useEffect, useRef, useState } from "react";

import { createCanvasStream, stopCanvasStream } from "./canvasStream";

const roomName =
  new URLSearchParams(window.location.search).get("room") ?? "livestream-e2e";

export function App() {
  const { getSandboxLivestream, getSandboxViewerToken } = useSandbox();
  const viewer = useLivestreamViewer();
  const streamer = useLivestreamStreamer();

  // eslint-disable-next-line
  (window as any).viewer = viewer;

  // Receive (WHEP) state
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const receiveVideoRef = useRef<HTMLVideoElement>(null);

  // Publish (WHIP) state
  const [publishError, setPublishError] = useState<string | null>(null);
  const publishVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!receiveVideoRef.current) return;
    receiveVideoRef.current.srcObject = viewer.stream;
  }, [viewer.stream]);

  const handleStartReceiving = async () => {
    setReceiveError(null);
    try {
      const viewerToken = await getSandboxViewerToken(roomName);
      await viewer.connect({ token: viewerToken });
    } catch (error) {
      const errorMessage =
        error === LivestreamError.UNAUTHORIZED
          ? "Unauthorized: Invalid or missing token"
          : error === LivestreamError.STREAM_NOT_FOUND
            ? "Stream not found"
            : error === LivestreamError.UNKNOWN_ERROR
              ? "Unknown error occurred"
              : String(error);

      setReceiveError(errorMessage);
      console.error("Failed to start receiving:", error);
    }
  };

  const handleStopReceiving = async () => {
    viewer.disconnect();
    if (receiveVideoRef.current) {
      receiveVideoRef.current.srcObject = null;
    }
  };

  const handleStartPublishing = async () => {
    setPublishError(null);
    try {
      const { streamerToken } = await getSandboxLivestream(roomName);

      // Create canvas stream with animated emoji
      const stream = createCanvasStream();

      localStreamRef.current = stream;

      if (publishVideoRef.current) {
        publishVideoRef.current.srcObject = stream;
      }

      await streamer.connect({
        inputs: { video: stream },
        token: streamerToken,
      });
    } catch (error) {
      const errorMessage =
        error === LivestreamError.UNAUTHORIZED
          ? "Unauthorized: Invalid or missing token"
          : error === LivestreamError.STREAM_NOT_FOUND
            ? "Stream not found"
            : error === LivestreamError.STREAMER_ALREADY_CONNECTED
              ? "Streamer already connected"
              : error === LivestreamError.UNKNOWN_ERROR
                ? "Unknown error occurred"
                : String(error);

      setPublishError(errorMessage);
      console.error("Failed to start publishing:", error);

      // Clean up local stream if it was created
      if (localStreamRef.current) {
        stopCanvasStream(localStreamRef.current);
        localStreamRef.current = null;
      }
    }
  };

  const handleStopPublishing = async () => {
    streamer.disconnect();

    if (localStreamRef.current) {
      stopCanvasStream(localStreamRef.current);
      localStreamRef.current = null;
    }

    if (publishVideoRef.current) {
      publishVideoRef.current.srcObject = null;
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Livestream E2E Tests</h1>

      <div style={{ display: "flex", gap: "40px", marginTop: "20px" }}>
        {/* Receive Section */}
        <div style={{ flex: 1 }}>
          <h2>Receive (WHEP)</h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <button
              id="receive-button"
              onClick={
                viewer.isConnected ? handleStopReceiving : handleStartReceiving
              }
              style={{ padding: "10px", cursor: "pointer" }}
            >
              {viewer.isConnected ? "Stop Receiving" : "Start Receiving"}
            </button>
            {receiveError && (
              <div
                id="receive-error"
                style={{ color: "red", fontSize: "14px" }}
              >
                Error: {receiveError}
              </div>
            )}
            <div
              id="receive-status"
              style={{ fontSize: "14px", color: "#666" }}
            >
              Status: {viewer.isConnected ? "Receiving" : "Not receiving"}
            </div>
          </div>

          <video
            id="receive-video"
            ref={receiveVideoRef}
            autoPlay
            playsInline
            controls
            style={{ width: "100%", marginTop: "20px", background: "#000" }}
          />
        </div>

        {/* Publish Section */}
        <div style={{ flex: 1 }}>
          <h2>Publish (WHIP)</h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <button
              id="publish-button"
              onClick={
                streamer.isConnected
                  ? handleStopPublishing
                  : handleStartPublishing
              }
              style={{ padding: "10px", cursor: "pointer" }}
            >
              {streamer.isConnected ? "Stop Publishing" : "Start Publishing"}
            </button>
            {publishError && (
              <div
                id="publish-error"
                style={{ color: "red", fontSize: "14px" }}
              >
                Error: {publishError}
              </div>
            )}
            <div
              id="publish-status"
              style={{ fontSize: "14px", color: "#666" }}
            >
              Status: {streamer.isConnected ? "Publishing" : "Not publishing"}
            </div>
          </div>

          <video
            id="publish-video"
            ref={publishVideoRef}
            autoPlay
            playsInline
            muted
            controls
            style={{ width: "100%", marginTop: "20px", background: "#000" }}
          />
        </div>
      </div>
    </div>
  );
}
