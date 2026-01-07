import React, { useState } from "react";
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Button, TextInput, DismissKeyboard } from "../../components";

const FishjamLogo = require("../../assets/images/fishjam-logo.png");

export default function RoomScreen() {
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("");

  const validateInputs = () => {
    if (!roomName) {
      throw new Error("Room name is required");
    }
  };

  const onTapConnectButton = async () => {
    try {
      validateInputs();
      setConnectionError(null);
      router.push({
        pathname: "/room/preview",
        params: { roomName, userName: userName || "Mobile User" },
      });
    } catch (e) {
      const message =
        "message" in (e as Error) ? (e as Error).message : "Unknown error";
      setConnectionError(message);
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
            onChangeText={setRoomName}
            placeholder="Room Name"
            defaultValue={roomName}
          />
          <TextInput
            onChangeText={setUserName}
            placeholder="Your Name (optional)"
            defaultValue={userName}
          />
          <Button
            title="Connect to Room"
            onPress={onTapConnectButton}
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
