import { useEffect, useRef, useState } from 'react';
import { getPixel, Pixel } from './mocks';

type Props = {
  stream?: MediaStream;
  id?: string;
};

const rgbToText = (pixel: Pixel): string => {
  const { red, green, blue } = pixel;
  if (red > 200 && green > 200 && blue > 200) return 'white';
  if (red < 55 && green < 55 && blue < 55) return 'black';
  if (red > 200 && green < 55 && blue < 55) return 'red';
  if (red < 55 && green > 200 && blue < 55) return 'green';
  if (red < 55 && green < 55 && blue > 200) return 'blue';

  return 'unknown';
};

export const VideoPlayerWithDetector = ({ stream, id }: Props) => {
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const [color, setColor] = useState<string>('');

  useEffect(() => {
    if (!videoElementRef.current) return;
    videoElementRef.current.srcObject = stream || null;
  }, [stream]);

  useEffect(() => {
    const id = setInterval(() => {
      const videoElement = videoElementRef.current;
      if (!videoElement || videoElement.videoWidth === 0) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixel = getPixel(imageData.data, canvas.width, 10, 10);
      setColor(rgbToText(pixel));
    }, 50);

    return () => {
      clearInterval(id);
    };
  }, []);

  return (
    <div>
      <div data-color-name={color}>{color}</div>
      <video
        id={id}
        style={{ maxHeight: '90px' }}
        autoPlay
        playsInline
        controls={false}
        muted
        ref={videoElementRef}
      />
    </div>
  );
};
