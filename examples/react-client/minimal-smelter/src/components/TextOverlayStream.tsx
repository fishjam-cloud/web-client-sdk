import { InputStream, Rescaler, Text, View } from "@swmansion/smelter";
import type { FC } from "react";
import { useEffect, useState } from "react";

type TickerProps = {
  text: string;
  width: number;
  height: number;
  margin: number;
  transitionDurationMs: number;
};

const FPS = 30;

const Ticker: FC<TickerProps> = ({
  text,
  width,
  height,
  margin,
  transitionDurationMs,
}: TickerProps) => {
  const [offset, setOffset] = useState(-width);

  useEffect(() => {
    setTimeout(() => {
      const newOffset = offset + (2000 * width) / (FPS * transitionDurationMs);
      setOffset(newOffset >= width ? -width : newOffset);
    }, 1000 / FPS);
  }, [transitionDurationMs, offset, width]);

  return (
    <View
      style={{
        bottom: 0,
        left: 0,
        width,
        height,
        backgroundColor: "blue",
      }}
    >
      <Rescaler
        style={{
          width,
          height: height - 2 * margin,
          top: margin,
          left: offset,
        }}
      >
        <View>
          <Text style={{ fontSize: 20 }}>{text}</Text>
        </View>
      </Rescaler>
    </View>
  );
};

type TextOverlayInputStreamProps = {
  text: string;
  inputId: string;
  width: number;
  height: number;
};

export const TextOverlayStream = ({
  text,
  width,
  height,
  inputId,
}: TextOverlayInputStreamProps) => (
  <View style={{ width, height }}>
    <Rescaler>
      <InputStream inputId={inputId} />
    </Rescaler>
    <Ticker
      text={text}
      transitionDurationMs={5000}
      width={width}
      height={30}
      margin={5}
    />
  </View>
);
