import React, { useState, useCallback } from "react";
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button, TextInput, DismissKeyboard } from "../../components";
import { changeFishjamId } from "../../utils/fishjamIdStore";

const FishjamLogo = require("../../assets/images/fishjam-logo.png");

const VIDEOROOM_STAGING_SANDBOX_URL =
  process.env.EXPO_PUBLIC_VIDEOROOM_STAGING_SANDBOX_URL ?? "";
const VIDEOROOM_PROD_SANDBOX_URL =
  process.env.EXPO_PUBLIC_FISHJAM_ID ?? "";

type VideoRoomEnv = "staging" | "prod";

type VideoRoomData = {
  videoRoomEnv: VideoRoomEnv;
  roomName: string;
  userName: string;
};

async function saveStorageData(videoRoomData: VideoRoomData) {
  await AsyncStorage.setItem("videoRoomData", JSON.stringify(videoRoomData));
}

async function readStorageData(): Promise<VideoRoomData> {
  const storageData = await AsyncStorage.getItem("videoRoomData");
  if (storageData) {
    const videoRoomData = JSON.parse(storageData) as VideoRoomData;
    return videoRoomData;
  }
  return { videoRoomEnv: "staging", roomName: "", userName: "" };
}

export default function RoomScreen() {
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("");
  const [videoRoomEnv, setVideoRoomEnv] = useState<VideoRoomEnv>("staging");

  const handleEnvChange = (env: VideoRoomEnv) => {
    setVideoRoomEnv(env);
    if (env === "staging") {
      changeFishjamId(VIDEOROOM_STAGING_SANDBOX_URL);
    } else {
      changeFishjamId(VIDEOROOM_PROD_SANDBOX_URL);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        const {
          videoRoomEnv: storedVideoRoomEnv,
          roomName: storedRoomName,
          userName: storedUserName,
        } = await readStorageData();

        setRoomName(storedRoomName);
        setUserName(storedUserName);
        setVideoRoomEnv(storedVideoRoomEnv);

        if (storedVideoRoomEnv === "staging") {
          changeFishjamId(VIDEOROOM_STAGING_SANDBOX_URL);
        } else {
          changeFishjamId(VIDEOROOM_PROD_SANDBOX_URL);
        }
      };
      loadData();
    }, [])
  );

  const validateInputs = () => {
    if (!roomName) {
      throw new Error("Room name is required");
    }
  };

  const onTapConnectButton = async () => {
    try {
      validateInputs();
      setConnectionError(null);
      
      const displayName = userName || "Mobile User";
      await saveStorageData({ videoRoomEnv, roomName, userName: displayName });
      
      Keyboard.dismiss();
      router.push({
        pathname: "/room/preview",
        params: { roomName, userName: displayName},
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
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              rowGap: 10,
            }}>
            <Button
              title="Staging"
              type={videoRoomEnv === 'staging' ? 'primary' : 'secondary'}
              onPress={() => handleEnvChange('staging')}
            />
            <Button
              title="Production"
              type={videoRoomEnv === 'prod' ? 'primary' : 'secondary'}
              onPress={() => handleEnvChange('prod')}
            />
          </View>
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
