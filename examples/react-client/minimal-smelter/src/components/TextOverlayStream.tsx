import { InputStream, Rescaler, Text, View } from "@swmansion/smelter";
import type { FC } from "react";
import { useEffect, useState } from "react";

type BouncerProps = {
  text: string;
  width: number;
  height: number;
  margin: number;
  transitionDurationMs: number;
};

const Bouncer: FC<BouncerProps> = ({
  text,
  width,
  height,
  margin,
  transitionDurationMs,
}: BouncerProps) => {
  const [offset, setOffset] = useState(-width);

  useEffect(() => {
    setOffset((oldOffset) => -oldOffset);
    const interval = setInterval(
      () => setOffset((oldOffset) => -oldOffset),
      transitionDurationMs + 500,
    );
    return () => {
      clearInterval(interval);
    };
  }, [transitionDurationMs]);

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
        transition={{ durationMs: transitionDurationMs }}
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
    <Bouncer
      text={text}
      transitionDurationMs={5000}
      width={width}
      height={30}
      margin={5}
    />
  </View>
);
