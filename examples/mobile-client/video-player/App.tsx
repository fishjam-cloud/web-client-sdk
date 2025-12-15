import { useState } from "react";
import { Button, StyleSheet, TextInput, View } from "react-native";
import { FishjamPlayerStreamer } from "./components/FishjamPlayerStreamer";
import { FishjamPlayerViewer } from "./components/FishjamPlayerViewer";
import { FishjamProvider } from "@fishjam-cloud/mobile-client";

export default function App() {
  const FISHJAM_URL = process.env.EXPO_PUBLIC_FISHJAM_ID ?? "";
  const [roomName, setRoomName] = useState('test-room');
  const [selection, setSelection] = useState<'streamer' | 'viewer' | 'none'>(
    'none',
  );

  return (
    <FishjamProvider fishjamId={FISHJAM_URL} reconnect={true}>
      <View style={styles.container}>
        {selection === 'none' && (
          <>
            <TextInput
              style={styles.textInput}
              placeholder="Room Name"
              value={roomName}
              onChangeText={setRoomName}
            />
            <Button title="Stream" onPress={() => setSelection('streamer')} />
            <Button title="View stream" onPress={() => setSelection('viewer')} />
          </>
        )}
        {selection === 'streamer' && (
          <>
            <FishjamPlayerStreamer roomName={roomName} />
            <Button title="Back" onPress={() => setSelection('none')} />
          </>
        )}
        {selection === 'viewer' && (
          <>
            <FishjamPlayerViewer roomName={roomName} />
            <Button title="Back" onPress={() => setSelection('none')} />
          </>
        )}
      </View>
    </FishjamProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
  },
  textInput: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: 'gray',
    borderRadius: 8,
    padding: 8,
    marginBottom: 16,
  },
});
