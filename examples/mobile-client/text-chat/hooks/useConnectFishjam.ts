import { useConnection, useSandbox } from '@fishjam-cloud/react-native-client';
import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';

import type { RootStackParamList } from '../navigation/RootNavigation';

export const useConnectFishjam = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { leaveRoom, joinRoom } = useConnection();
  const { getSandboxPeerToken } = useSandbox();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = async (roomName: string, userName: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const peerToken = await getSandboxPeerToken(
        roomName,
        userName,
        'conference',
      );
      await joinRoom({
        peerToken,
        peerMetadata: {
          displayName: userName,
        },
      });
      navigation.navigate('Chat', { roomName, userName });
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err : new Error('Failed to connect to Fishjam');
      console.error('Error connecting to Fishjam', errorMsg);
      setError(errorMsg);
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
    error,
  };
};
