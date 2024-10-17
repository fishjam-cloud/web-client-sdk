import { useEffect, useRef } from "react";

type Props = {
  track?: MediaStreamTrack | null;
};

export const AudioVisualizer = ({ track }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const idRef = useRef<number | null>(null);
  const clearCanvasRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!track) {
      clearCanvasRef.current();
      return;
    }
    if (!canvasRef.current) return;

    const audioContext = new AudioContext();

    const stream = new MediaStream([track]);
    const mediaStreamSource = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    const canvas = canvasRef.current;
    const canvasContext: CanvasRenderingContext2D = canvas.getContext("2d")!;

    clearCanvasRef.current = () =>
      canvasContext.clearRect(0, 0, canvas.width, canvas.height);

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

      clearCanvasRef.current();

      const barWidth = canvas.width / bufferLength;

      let x = 0;

      analyser.getByteFrequencyData(dataArray);

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] * 50) / 256;
        canvasContext.fillStyle = "#000000";
        canvasContext.fillRect(
          x,
          canvas.height - barHeight,
          barWidth,
          barHeight,
        );

        x += barWidth + 1;
      }
    }

    renderFrame();

    return () => {
      if (idRef.current) {
        cancelAnimationFrame(idRef.current);
      }
    };
  }, [track]);

  return <canvas ref={canvasRef} width={200} height={50} />;
};

export default AudioVisualizer;
