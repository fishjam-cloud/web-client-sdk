import React, { useState } from "react";
import { Button, SafeAreaView, StyleSheet, TextInput } from "react-native";
import { useConnectFishjam } from "../../hooks/useConnectFishjam";

const HomeScreen = () => {
  const [roomName, setRoomName] = useState("");
  const [userName, setUserName] = useState("");
  const { connect, isLoading } = useConnectFishjam();

  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        placeholder="Room Name"
        placeholderTextColor="gray"
        style={styles.input}
        value={roomName}
        onChangeText={setRoomName}
      />
      <TextInput
        placeholder="User Name"
        placeholderTextColor="gray"
        style={styles.input}
        value={userName}
        onChangeText={setUserName}
      />
      <Button
        title="Connect"
        onPress={() => {
          connect(roomName, userName);
        }}
        disabled={isLoading || !roomName || !userName}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
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
});

export default HomeScreen;
