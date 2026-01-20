import React, { type ReactNode } from "react";
import { StyleSheet, Text, type TextProps } from "react-native";

import { TextColors } from "../utils/Colors";

type VariantName = "button" | "body-small" | "label";

type TypoProps = {
  variant: VariantName;
  color?: string;
  children: ReactNode;
} & TextProps;

export default function Typo({
  variant = "body-small",
  color = TextColors.darkText,
  children,
  style,
  ...textProps
}: TypoProps) {
  const variantStyle = TextStyles[variant];

  return (
    <Text style={[{ color }, variantStyle, style]} {...textProps}>
      {children}
    </Text>
  );
}

const TextStyles = StyleSheet.create({
  button: {
    fontWeight: "600",
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 0.5,
  },
  "body-small": {
    fontWeight: "400",
    fontSize: 16,
    lineHeight: 28,
  },
  label: {
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 16,
  },
});

export const TextInputTextStyle = StyleSheet.create({
  body: {
    fontSize: 16,
  },
});
