import { useEffect, useRef } from "react";

type Props = {
  stream?: MediaStream | null;
};

export const AudioVisualizer = ({ stream }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const idRef = useRef<number | null>(null);

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
  }, [stream]);

  return <canvas ref={canvasRef} width={200} height={50} />;
};

export default AudioVisualizer;
