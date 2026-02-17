import React, { useState } from "react";
import {
  Button,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useConnectFishjam } from "../../hooks/useConnectFishjam";
import { SafeAreaView } from "react-native-safe-area-context";

const HomeScreen = () => {
  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("");
  const { connect, isLoading, error } = useConnectFishjam();

  return (
    <SafeAreaView style={styles.container}>
      <Pressable style={styles.content} onPress={Keyboard.dismiss}>
        <View style={styles.form}>
          <TextInput
            placeholder="Room Name"
            placeholderTextColor="gray"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            autoFocus={true}
            style={styles.input}
            value={roomName}
            onChangeText={setRoomName}
          />
          <TextInput
            placeholder="User Name"
            placeholderTextColor="gray"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            style={styles.input}
            value={userName}
            onChangeText={setUserName}
          />
          {error && (
            <Text style={styles.errorText}>
              Failed to connect. Please try again.
            </Text>
          )}
          <Button
            title="Connect"
            onPress={() => {
              connect(roomName, userName);
            }}
            disabled={isLoading || !roomName || !userName}
          />
        </View>
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  form: {
    width: "100%",
    gap: 16,
  },
  input: {
    width: "100%",
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  errorText: {
    color: "#dc3545",
    marginBottom: 8,
  },
});

export default HomeScreen;
