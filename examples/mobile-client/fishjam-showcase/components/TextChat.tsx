import { useConnection, useDataChannel } from '@fishjam-cloud/react-native-client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AdditionalColors, BrandColors } from '../utils/Colors';

type ChatMessage = {
  timestamp: number;
  sender: string;
  payload: string;
};

type TextChatProps = {
  visible: boolean;
  onRequestClose: () => void;
  userName: string;
};

export default function TextChat({
  visible,
  onRequestClose,
  userName,
}: TextChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const { peerStatus } = useConnection();
  const {
    publishData,
    subscribeData,
    initializeDataChannel,
    dataChannelReady,
    dataChannelLoading,
    dataChannelError,
  } = useDataChannel();

  useEffect(() => {
    if (!visible) return;
    if (peerStatus === 'connected') {
      initializeDataChannel();
    }
  }, [visible, peerStatus, initializeDataChannel]);

  useEffect(() => {
    if (!visible || dataChannelLoading || !dataChannelReady) return;

    const unsubscribe = subscribeData(
      (data: Uint8Array) => {
        const message = new TextDecoder().decode(data);
        try {
          const parsed = JSON.parse(message) as ChatMessage;
          setMessages((prev) => [...prev, parsed]);
        } catch {
          console.error('Failed to parse message:', message);
        }
      },
      { reliable: true },
    );

    return () => {
      unsubscribe();
    };
  }, [visible, dataChannelReady, dataChannelLoading, subscribeData]);

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
    setInputValue('');
  }, [inputValue, dataChannelLoading, dataChannelReady, userName, publishData]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwn = item.sender === userName;
    return (
      <View
        style={[
          styles.message,
          isOwn ? styles.ownMessage : styles.otherMessage,
        ]}>
        <View style={styles.messageMeta}>
          <Text style={[styles.sender, isOwn && styles.ownMessageText]}>
            {item.sender}{' '}
          </Text>
          <Text style={[styles.time, isOwn && styles.ownMessageText]}>
            {new Date(item.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <Text style={[styles.payload, isOwn && styles.ownMessageText]}>
          {item.payload}
        </Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Data channel chat</Text>
          <Pressable onPress={onRequestClose}>
            <Text style={styles.closeLink}>Close</Text>
          </Pressable>
        </View>

        {(peerStatus === 'connecting' ||
          dataChannelLoading ||
          dataChannelError) && (
          <View style={styles.statusContainer}>
            {peerStatus === 'connecting' && <Text>Connecting…</Text>}
            {dataChannelLoading && <Text>Opening data channel…</Text>}
            {dataChannelError && (
              <Text style={styles.errorText}>{dataChannelError.message}</Text>
            )}
          </View>
        )}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => `${item.timestamp}-${item.sender}`}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesContainer}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <Text style={styles.emptyStateText}>No messages yet</Text>
          }
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message…"
            placeholderTextColor={BrandColors.darkBlue60}
            value={inputValue}
            onChangeText={setInputValue}
            editable={dataChannelReady}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <Pressable
            style={[
              styles.sendButton,
              (!dataChannelReady || !inputValue.trim()) &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!dataChannelReady || !inputValue.trim()}>
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 48,
    backgroundColor: BrandColors.seaBlue20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.darkBlue100,
  },
  closeLink: {
    color: BrandColors.seaBlue100,
    fontWeight: '600',
  },
  statusContainer: {
    paddingVertical: 8,
  },
  errorText: {
    color: AdditionalColors.red80,
  },
  messagesContainer: {
    paddingBottom: 8,
    gap: 12,
    flexGrow: 1,
  },
  emptyStateText: {
    textAlign: 'center',
    color: BrandColors.darkBlue60,
    marginTop: 24,
  },
  message: {
    padding: 10,
    borderRadius: 10,
    maxWidth: '85%',
  },
  ownMessage: {
    backgroundColor: BrandColors.darkBlue100,
    alignSelf: 'flex-end',
  },
  otherMessage: {
    backgroundColor: BrandColors.seaBlue40,
    alignSelf: 'flex-start',
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sender: {
    fontWeight: '600',
    color: BrandColors.darkBlue100,
  },
  time: {
    color: BrandColors.darkBlue60,
  },
  payload: {
    color: BrandColors.darkBlue100,
  },
  ownMessageText: {
    color: 'rgba(255, 255, 255, 0.95)',
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BrandColors.darkBlue40,
  },
  messageInput: {
    flex: 1,
    borderColor: BrandColors.darkBlue80,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: BrandColors.darkBlue100,
  },
  sendButton: {
    backgroundColor: BrandColors.seaBlue100,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
