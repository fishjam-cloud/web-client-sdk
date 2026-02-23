import React from "react";
import { View, StyleSheet } from "react-native";

import Typo from "./Typo";
import { BrandColors } from "../utils/Colors";

type NoCameraViewProps = {
  username: string;
  isSmallTile?: boolean;
};

export default function NoCameraView({
  username,
  isSmallTile,
}: NoCameraViewProps) {
  return (
    <View style={styles.noCameraBackground}>
      <View
        style={[
          styles.noCameraContent,
          isSmallTile ? styles.smallContent : styles.bigContent,
        ]}
      >
        <Typo variant="body-small" color={BrandColors.darkBlue80}>
          {username}
        </Typo>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noCameraBackground: {
    backgroundColor: BrandColors.seaBlue20,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  noCameraContent: {
    borderRadius: 5000,
    borderColor: BrandColors.darkBlue60,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  bigContent: {
    width: 132,
    height: 132,
  },
  smallContent: {
    width: 75,
    height: 75,
  },
});
