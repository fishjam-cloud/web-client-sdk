import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { FishjamPlayerStreamer } from "./components/FishjamPlayerStreamer";
import { FishjamPlayerViewer } from "./components/FishjamPlayerViewer";
import { FishjamProvider } from "@fishjam-cloud/react-native-client";

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
          <View style={styles.homeContainer}>
            <Text style={styles.title}>Fishjam Video Player</Text>
            <Text style={styles.subtitle}>Enter a room name to get started</Text>
            
            <TextInput
              style={styles.textInput}
              placeholder="Room Name"
              placeholderTextColor="#999"
              value={roomName}
              onChangeText={setRoomName}
            />
            
            <TouchableOpacity 
              style={[styles.button, styles.primaryButton]} 
              onPress={() => setSelection('streamer')}
            >
              <Text style={styles.buttonText}>📹 Start Streaming</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={() => setSelection('viewer')}
            >
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>👁️ Watch Stream</Text>
            </TouchableOpacity>
          </View>
        )}
        {selection === 'streamer' && (
          <View style={styles.screenContainer}>
            <FishjamPlayerStreamer roomName={roomName} />
            <TouchableOpacity 
              style={[styles.button, styles.backButton]} 
              onPress={() => setSelection('none')}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}
        {selection === 'viewer' && (
          <View style={styles.screenContainer}>
            <FishjamPlayerViewer roomName={roomName} />
            <TouchableOpacity 
              style={[styles.button, styles.backButton]} 
              onPress={() => setSelection('none')}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </FishjamProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  homeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  screenContainer: {
    flex: 1,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#8892b0',
    marginBottom: 32,
    textAlign: 'center',
  },
  textInput: {
    width: '100%',
    height: 52,
    borderWidth: 2,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    fontSize: 16,
    color: '#ffffff',
    backgroundColor: '#252542',
  },
  button: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryButtonText: {
    color: '#6366f1',
  },
  backButton: {
    backgroundColor: '#374151',
    marginTop: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
