import {
  useConnection,
  useDataChannel,
  useSandbox,
} from "@fishjam-cloud/react-client";
import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = {
  timestamp: number;
  sender: string;
  payload: string;
};

export const App = () => {
  const [roomName, setRoomName] = useState("");
  const [username, setUsername] = useState("");
  const [currentUsername, setCurrentUsername] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { joinRoom, leaveRoom, peerStatus } = useConnection();
  const { getSandboxPeerToken } = useSandbox();
  const {
    publishData,
    subscribeData,
    initializeDataChannel,
    dataChannelReady,
    dataChannelLoading,
  } = useDataChannel();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const handleJoin = useCallback(async () => {
    if (!roomName || !username) return;
    const peerToken = await getSandboxPeerToken(
      roomName,
      username,
      "conference",
    );
    await joinRoom({ peerToken });
    setCurrentUsername(username);
  }, [roomName, username, getSandboxPeerToken, joinRoom]);

  useEffect(() => {
    if (peerStatus === "connected") {
      initializeDataChannel();
    }
  }, [peerStatus, initializeDataChannel]);

  const handleLeave = useCallback(() => {
    leaveRoom();
    setMessages([]);
    setCurrentUsername("");
  }, [leaveRoom]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || dataChannelLoading || !dataChannelReady) return;

    const message: ChatMessage = {
      timestamp: Date.now(),
      sender: currentUsername,
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
    currentUsername,
    publishData,
  ]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (peerStatus === "idle" || peerStatus === "error") {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Fishjam Chat</h1>
        {peerStatus === "error" && (
          <p style={styles.error}>Failed to connect. Please try again.</p>
        )}
        <div style={styles.form}>
          <input
            style={styles.input}
            type="text"
            placeholder="Room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <input
            style={styles.input}
            type="text"
            placeholder="Your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button
            style={styles.button}
            onClick={handleJoin}
            disabled={!roomName || !username}
          >
            Join Room
          </button>
        </div>
      </div>
    );
  }

  if (peerStatus === "connecting") {
    return (
      <div style={styles.container}>
        <p>Connecting...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Fishjam Chat</h1>
        <div style={styles.headerInfo}>
          <span>Room: {roomName}</span>
          <span>User: {currentUsername}</span>
          <button style={styles.leaveButton} onClick={handleLeave}>
            Leave
          </button>
        </div>
      </div>

      <div style={styles.messagesContainer}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              ...styles.message,
              ...(msg.sender === currentUsername
                ? styles.ownMessage
                : styles.otherMessage),
            }}
          >
            <div style={styles.messageMeta}>
              <span style={styles.sender}>{msg.sender}</span>
              <span style={styles.time}>{formatTime(msg.timestamp)}</span>
            </div>
            <div style={styles.payload}>{msg.payload}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputContainer}>
        <input
          style={styles.messageInput}
          type="text"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={!dataChannelReady}
        />
        <button
          style={styles.sendButton}
          onClick={handleSend}
          disabled={!dataChannelReady || !inputValue.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "50vh",
    maxWidth: "600px",
    margin: "0 auto",
    padding: "16px",
    fontFamily: "system-ui, sans-serif",
  },
  title: {
    margin: "0 0 16px 0",
    fontSize: "24px",
  },
  error: {
    color: "red",
    marginBottom: "16px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  input: {
    padding: "12px",
    fontSize: "16px",
    border: "1px solid #ccc",
    borderRadius: "4px",
  },
  button: {
    padding: "12px",
    fontSize: "16px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    flexWrap: "wrap",
    gap: "8px",
  },
  headerInfo: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
    fontSize: "14px",
    color: "#666",
  },
  leaveButton: {
    padding: "6px 12px",
    fontSize: "14px",
    backgroundColor: "#dc3545",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
  messagesContainer: {
    flex: 1,
    overflowY: "auto",
    border: "1px solid #ccc",
    borderRadius: "4px",
    padding: "12px",
    marginBottom: "16px",
    backgroundColor: "#f9f9f9",
  },
  message: {
    marginBottom: "12px",
    padding: "8px 12px",
    borderRadius: "8px",
    maxWidth: "80%",
  },
  ownMessage: {
    backgroundColor: "#007bff",
    color: "white",
    marginLeft: "auto",
  },
  otherMessage: {
    backgroundColor: "#e9e9e9",
    color: "black",
    marginRight: "auto",
  },
  messageMeta: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "12px",
    marginBottom: "4px",
    opacity: 0.8,
  },
  sender: {
    fontWeight: "bold",
  },
  time: {},
  payload: {
    wordBreak: "break-word",
  },
  inputContainer: {
    display: "flex",
    gap: "8px",
  },
  messageInput: {
    flex: 1,
    padding: "12px",
    fontSize: "16px",
    border: "1px solid #ccc",
    borderRadius: "4px",
  },
  sendButton: {
    padding: "12px 24px",
    fontSize: "16px",
    backgroundColor: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
  },
};
