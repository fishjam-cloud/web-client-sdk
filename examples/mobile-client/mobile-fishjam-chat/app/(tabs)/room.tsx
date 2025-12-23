import React, { useState } from "react";
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, TextInput, DismissKeyboard } from "../../components";

const FishjamLogo = require("../../assets/images/fishjam-logo.png");

export default function RoomScreen() {
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [fishjamId, setFishjamId] = useState(
    process.env.EXPO_PUBLIC_FISHJAM_ID ?? "",
  );
  const [roomName, setRoomName] = useState("");

  const validateInputs = () => {
    if (!fishjamId) {
      throw new Error("Fishjam ID is required");
    }

    if (!roomName) {
      throw new Error("Room name is required");
    }
  };

  const onTapConnectButton = async () => {
    try {
      validateInputs();
      setConnectionError(null);
      setLoading(true);

      // TODO: Navigate to room screen with Fishjam connection
      Alert.alert("Navigate", `Room: ${fishjamId} / ${roomName}`);
    } catch (e) {
      const message =
        "message" in (e as Error) ? (e as Error).message : "Unknown error";
      setConnectionError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DismissKeyboard>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior="height" style={styles.container}>
          {connectionError && (
            <Text style={styles.errorMessage}>{connectionError}</Text>
          )}
          <Image
            style={styles.logo}
            source={FishjamLogo}
            resizeMode="contain"
          />
          <TextInput
            onChangeText={setFishjamId}
            placeholder="Fishjam ID"
            defaultValue={fishjamId}
          />
          <TextInput
            onChangeText={setRoomName}
            placeholder="Room Name"
            defaultValue={roomName}
          />
          <Button
            title="Connect to Room"
            onPress={onTapConnectButton}
            disabled={loading}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </DismissKeyboard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#BFE7F8",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#BFE7F8",
    padding: 20,
    gap: 24,
  },
  errorMessage: {
    color: "black",
    textAlign: "center",
    margin: 25,
    fontSize: 20,
  },
  logo: {
    width: Dimensions.get("window").width - 40,
  },
});
