import { router } from 'expo-router';
import { useState } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, DismissKeyboard, TextInput } from '../../components';
import { changeFishjamId } from '../../utils/fishjamIdStore';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FishjamLogo = require('../../assets/images/fishjam-logo.png');

const VIDEOROOM_STAGING_SANDBOX_URL =
  process.env.EXPO_PUBLIC_VIDEOROOM_STAGING_SANDBOX_URL ?? '';
const VIDEOROOM_PROD_SANDBOX_URL = process.env.EXPO_PUBLIC_FISHJAM_ID ?? '';

type VideoRoomEnv = 'staging' | 'prod';

export default function RoomScreen() {
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [videoRoomEnv, setVideoRoomEnv] = useState<VideoRoomEnv>('prod');

  const handleEnvChange = (env: VideoRoomEnv) => {
    setVideoRoomEnv(env);
    if (env === 'staging') {
      changeFishjamId(VIDEOROOM_STAGING_SANDBOX_URL);
    } else {
      changeFishjamId(VIDEOROOM_PROD_SANDBOX_URL);
    }
  };

  const validateInputs = () => {
    if (!roomName) {
      throw new Error('Room name is required');
    }
  };

  const onTapConnectButton = async () => {
    const displayName = userName || 'Mobile User';
    try {
      validateInputs();
      setConnectionError(null);

      Keyboard.dismiss();
      router.push({
        pathname: '/room/preview',
        params: { roomName, userName: displayName },
      });
    } catch (e) {
      const message =
        'message' in (e as Error) ? (e as Error).message : 'Unknown error';
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
          {VIDEOROOM_STAGING_SANDBOX_URL && (
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
          )}
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
          <Button title="Connect to Room" onPress={onTapConnectButton} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </DismissKeyboard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#BFE7F8',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#BFE7F8',
    padding: 20,
    gap: 24,
  },
  errorMessage: {
    color: 'black',
    textAlign: 'center',
    margin: 25,
    fontSize: 20,
  },
  logo: {
    width: Dimensions.get('window').width - 40,
  },
});
