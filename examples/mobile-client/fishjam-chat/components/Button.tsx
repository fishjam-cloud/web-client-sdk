import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import Typo from "./Typo";
import { AdditionalColors, BrandColors, TextColors } from "../utils/Colors";

type ButtonType = "primary" | "danger" | "secondary";

type ButtonProps = {
  type?: ButtonType;
  disabled?: boolean;
  onPress: () => void;
  title: string;
};

export default function Button({
  type = "primary",
  disabled = false,
  onPress,
  title,
}: ButtonProps) {
  const backgroundStyle = disabled
    ? styles.disabled
    : type === "primary"
      ? styles.primary
      : type === "danger"
        ? styles.danger
        : styles.secondary;

  const textColor = disabled
    ? TextColors.white
    : type === "secondary"
      ? TextColors.darkText
      : TextColors.white;

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}>
      <View style={[styles.common, backgroundStyle]}>
        <Typo variant="button" color={textColor}>
          {title}
        </Typo>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  common: {
    width: "100%",
    height: 56,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  primary: {
    backgroundColor: BrandColors.darkBlue100,
  },
  danger: {
    backgroundColor: AdditionalColors.red100,
  },
  secondary: {
    backgroundColor: AdditionalColors.white,
  },
  disabled: {
    backgroundColor: AdditionalColors.grey60,
  },
});
