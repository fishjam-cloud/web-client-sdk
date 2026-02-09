import { useEffect, useState } from "react";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import {
  useConnection,
  useSandbox,
} from "@fishjam-cloud/react-native-client";
import { RootStackParamList } from "../navigation/RootNavigation";

export const useConnectFishjam = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { leaveRoom, joinRoom } = useConnection();
  const { getSandboxPeerToken } = useSandbox();

  const [isLoading, setIsLoading] = useState(false);

  const connect = async (roomName: string, userName: string) => {
    try {
      setIsLoading(true);
      const peerToken = await getSandboxPeerToken(roomName, userName);
      await joinRoom({
        peerToken,
        peerMetadata: {
          displayName: userName,
        },
      });
      navigation.navigate("Chat", { roomName, userName });
    } catch (error) {
      console.error("Error connecting to Fishjam", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      leaveRoom();
    };
  }, [leaveRoom]);

  return {
    connect,
    isLoading,
  };
};
