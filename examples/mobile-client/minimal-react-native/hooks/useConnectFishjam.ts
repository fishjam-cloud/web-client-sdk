import { useEffect, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import {
  useCamera,
  useConnection,
  useSandbox,
} from '@fishjam-cloud/mobile-client';
import { RootStackParamList } from '../navigation/RootNavigation';

export const useConnectFishjam = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const { leaveRoom, joinRoom } = useConnection();
  const { getSandboxPeerToken } = useSandbox({
    configOverride: {
      sandboxApiUrl: process.env.EXPO_PUBLIC_FISHJAM_URL,
    },
  });
  const { toggleCamera, isCameraOn } = useCamera();

  const [isLoading, setIsLoading] = useState(false);

  const connect = async (roomName: string, userName: string) => {
    try {
      setIsLoading(true);

      leaveRoom();
      const peerToken = await getSandboxPeerToken(roomName, userName);

      // Start camera if not already on
      if (!isCameraOn) {
        await toggleCamera();
      }

      await joinRoom({
        peerToken,
        peerMetadata: {
          displayName: userName,
        },
      });
      navigation.navigate('Room', {
        userName,
      });
    } catch (e) {
      console.error('Error connecting to Fishjam', e);
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
