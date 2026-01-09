import React, { useCallback } from "react";
import { StyleSheet, View, Text, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components";
import { BrandColors } from "../../utils/Colors";

export default function LivestreamScreenSharingScreen() {
  const handleStartScreenShare = useCallback(() => {
    Alert.alert(
      "Not Implemented",
      "Screen sharing is not implemented yet.",
      [{ text: "OK" }]
    );
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.box}>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Screen sharing allows you to broadcast your device screen.
          </Text>
        </View>

        <Button
          title="Start Screen Capture"
          onPress={handleStartScreenShare}
        />

        <Text style={styles.statusText}>
          Screen Capture: Inactive
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1FAFE",
    padding: 24,
  },
  box: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  infoBox: {
    backgroundColor: BrandColors.seaBlue40,
    padding: 16,
    borderRadius: 12,
    width: "100%",
  },
  infoText: {
    fontSize: 14,
    color: BrandColors.darkBlue100,
    textAlign: "center",
  },
  statusText: {
    fontSize: 14,
    color: BrandColors.darkBlue100,
  },
});
