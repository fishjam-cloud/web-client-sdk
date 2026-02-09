import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useConnection,
  useDataChannel,
} from "@fishjam-cloud/react-native-client";
import { RootScreenProps } from "../../navigation/RootNavigation";

type ChatMessage = {
  timestamp: number;
  sender: string;
  payload: string;
};

const ChatScreen = ({ route, navigation }: RootScreenProps<"Chat">) => {
  const { roomName, userName } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const { peerStatus, leaveRoom } = useConnection();
  const {
    publishData,
    subscribeData,
    initializeDataChannel,
    dataChannelReady,
    dataChannelLoading,
    dataChannelError,
  } = useDataChannel();

  useEffect(() => {
    if (peerStatus === "connected") {
      initializeDataChannel();
    }
  }, [peerStatus, initializeDataChannel]);

  useEffect(() => {
    if (dataChannelLoading || !dataChannelReady) return;

    const unsubscribe = subscribeData(
      (data: Uint8Array) => {
        const message = new TextDecoder().decode(data);
        try {
          const parsed = JSON.parse(message) as ChatMessage;
          setMessages((prev) => [...prev, parsed]);
        } catch {
          console.error("Failed to parse message:", message);
        }
      },
      { reliable: true },
    );

    return () => {
      unsubscribe();
    };
  }, [dataChannelReady, dataChannelLoading, subscribeData]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const handleLeave = useCallback(() => {
    leaveRoom();
    navigation.goBack();
  }, [leaveRoom, navigation]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || dataChannelLoading || !dataChannelReady) return;

    const message: ChatMessage = {
      timestamp: Date.now(),
      sender: userName,
      payload: inputValue.trim(),
    };

    const encoded = new TextEncoder().encode(JSON.stringify(message));
    publishData(encoded, { reliable: true });
    setMessages((prev) => [...prev, message]);
    setInputValue("");
  }, [
    inputValue,
    dataChannelLoading,
    dataChannelReady,
    userName,
    publishData,
  ]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwn = item.sender === userName;
    return (
      <View
        style={[
          styles.message,
          isOwn ? styles.ownMessage : styles.otherMessage,
        ]}
      >
        <View style={styles.messageMeta}>
          <Text style={styles.sender}>{item.sender}</Text>
          <Text style={styles.time}>
            {new Date(item.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        <Text style={styles.payload}>{item.payload}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Fishjam Chat</Text>
          <Text style={styles.subtitle}>
            Room: {roomName} • User: {userName}
          </Text>
        </View>
        <Pressable style={styles.leaveButton} onPress={handleLeave}>
          <Text style={styles.leaveButtonText}>Leave</Text>
        </Pressable>
      </View>

      <View style={styles.statusContainer}>
        {peerStatus === "connecting" && <Text>Connecting...</Text>}
        {dataChannelLoading && <Text>Opening data channel...</Text>}
        {dataChannelError && (
          <Text style={styles.errorText}>{dataChannelError.message}</Text>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, index) => `${index}`}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesContainer}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor="gray"
            value={inputValue}
            onChangeText={setInputValue}
            editable={dataChannelReady}
          />
          <Pressable
            style={[
              styles.sendButton,
              (!dataChannelReady || !inputValue.trim()) &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!dataChannelReady || !inputValue.trim()}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
  subtitle: {
    color: "#666",
    marginTop: 4,
  },
  leaveButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#dc3545",
    borderRadius: 6,
  },
  leaveButtonText: {
    color: "white",
    fontWeight: "600",
  },
  statusContainer: {
    minHeight: 20,
  },
  errorText: {
    color: "#dc3545",
  },
  messagesContainer: {
    paddingBottom: 8,
    gap: 12,
  },
  message: {
    padding: 10,
    borderRadius: 10,
    maxWidth: "80%",
  },
  ownMessage: {
    backgroundColor: "#007bff",
    alignSelf: "flex-end",
  },
  otherMessage: {
    backgroundColor: "#e9e9e9",
    alignSelf: "flex-start",
  },
  messageMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sender: {
    fontWeight: "600",
    color: "#111",
  },
  time: {
    color: "#666",
  },
  payload: {
    color: "#111",
  },
  inputContainer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  messageInput: {
    flex: 1,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    backgroundColor: "#28a745",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: "white",
    fontWeight: "600",
  },
});

export default ChatScreen;
