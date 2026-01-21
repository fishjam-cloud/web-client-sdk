import React, { useState } from "react";
import { StyleSheet, TextInput as RNTextInput, View } from "react-native";

import { TextInputTextStyle } from "./Typo";
import { AdditionalColors, BrandColors, TextColors } from "../utils/Colors";

type TextInputProps = {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  editable?: boolean;
  onChangeText?: (text: string) => void;
};

export default function TextInput({
  placeholder = "",
  value,
  defaultValue,
  editable = true,
  onChangeText = () => {},
}: TextInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const borderStyle = isFocused ? styles.onFocus : styles.offFocus;

  const inputStyle = editable
    ? [styles.main, styles.active, borderStyle, TextInputTextStyle.body]
    : [styles.main, styles.notActive, TextInputTextStyle.body];

  return (
    <View>
      <RNTextInput
        style={inputStyle}
        placeholder={placeholder}
        placeholderTextColor={AdditionalColors.grey80}
        value={value}
        defaultValue={defaultValue}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        editable={editable}
        onChangeText={onChangeText}
        autoCapitalize="none"
        selectionColor={TextColors.additionalLightText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    width: "100%",
    height: 56,
    borderRadius: 40,
    borderStyle: "solid",
    borderWidth: 2,
    backgroundColor: AdditionalColors.white,
    paddingLeft: 16,
  },
  active: {
    color: TextColors.darkText,
  },
  notActive: {
    color: AdditionalColors.grey80,
    borderColor: AdditionalColors.grey60,
  },
  offFocus: {
    borderColor: BrandColors.darkBlue100,
  },
  onFocus: {
    borderColor: BrandColors.seaBlue80,
  },
});
