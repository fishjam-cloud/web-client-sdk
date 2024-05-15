import { useEffect, useRef, useState } from "react";

type Props = {
  stream: MediaStream | null | undefined;
  trackId: string | null;
};

export const AudioVisualizer = ({ stream, trackId }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasParentRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(400);

  useEffect(() => {
    setCanvasWidth(canvasParentRef?.current?.clientWidth || 400);
  }, [canvasParentRef?.current?.clientWidth]);

  useEffect(() => {
    if (!stream) return;
    if (!canvasRef.current) return;

    const audioContext = new AudioContext();
    if (stream.getAudioTracks().length === 0) return;
    const mediaStreamSource = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    const canvas = canvasRef.current;
    const canvasContext: CanvasRenderingContext2D = canvas.getContext("2d")!;

    mediaStreamSource.connect(analyser);

    analyser.fftSize = 64;

    const bufferLength = analyser.frequencyBinCount;

    const dataArray = new Uint8Array(bufferLength);

    function renderFrame() {
      idRef.current = requestAnimationFrame(renderFrame);

      if (!canvasRef.current) {
        cancelAnimationFrame(idRef.current);
        return;
      }

      canvasContext.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / bufferLength;

      let x = 0;

      analyser.getByteFrequencyData(dataArray);

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] * 50) / 256;
        canvasContext.fillStyle = "#000000";
        canvasContext.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    }

    renderFrame();

    return () => {
      idRef.current && cancelAnimationFrame(idRef.current);
    };
  }, [stream, trackId]);

  return (
    <div ref={canvasParentRef} className="flex flex-row flex-nowrap justify-center border-4">
      <canvas ref={canvasRef} width={canvasWidth} height={100} />
    </div>
  );
};

export default AudioVisualizer;
