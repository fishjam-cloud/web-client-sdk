import FishjamClient
import SwiftUI

private let maxChatMessages = 50

private struct ChatMessage: Identifiable {
    let id = UUID()
    let sender: String
    let text: String
    let reliable: Bool
}

/// Text chat over the data channels. Each message is UTF-8 JSON `{"name", "text"}`,
/// because a received payload does not say which peer sent it.
struct ChatView: View {
    @ObservedObject var client: FishjamClient
    let peerName: String
    @State private var messages: [ChatMessage] = []
    @State private var reliable = true
    @State private var input = ""
    @State private var unsubscribe: [() -> Void] = []
    @FocusState private var inputFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Chat")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Button("Start chat") {
                    Task { await client.initializeDataChannel() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(client.peerStatus != .connected || client.dataChannelReady || client.dataChannelLoading)
                .accessibilityIdentifier("chat-start")
            }
            Text(status)
                .font(.caption)
                .foregroundColor(client.dataChannelError == nil ? .primary : .red)
                .accessibilityIdentifier("chat-status")
            Toggle(reliable ? "Reliable (ordered)" : "Lossy (unordered)", isOn: $reliable)
                .accessibilityIdentifier("chat-reliable")
            HStack {
                TextField("Type a message...", text: $input)
                    .textFieldStyle(.roundedBorder)
                    .focused($inputFocused)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .accessibilityIdentifier("chat-input")
                Button("Send", action: send)
                    .buttonStyle(.bordered)
                    .disabled(!client.dataChannelReady || input.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityIdentifier("chat-send")
            }
            VStack(alignment: .leading, spacing: 2) {
                ForEach(messages) { message in
                    Text("\(message.sender)\(message.reliable ? "" : " [lossy]"): \(message.text)")
                        .font(.caption)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("chat-messages")
        }
        .padding(12)
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.secondary))
        // Subscribing before the channels exist is fine: messages arrive once they open.
        .onAppear {
            unsubscribe = [true, false].map { reliable in
                client.subscribeData(reliable: reliable) { data in
                    add(decodeChat(data, reliable: reliable))
                }
            }
        }
        .onDisappear {
            unsubscribe.forEach { $0() }
            unsubscribe = []
        }
    }

    private var status: String {
        if let error = client.dataChannelError {
            return "Error: \(error.localizedDescription)"
        }
        if client.dataChannelReady { return "Ready" }
        if client.dataChannelLoading { return "Loading..." }
        return "Not started"
    }

    private func send() {
        let text = input.trimmingCharacters(in: .whitespaces)
        guard client.dataChannelReady, !text.isEmpty else { return }
        client.publishData(encodeChat(name: peerName, text: text), reliable: reliable)
        add(ChatMessage(sender: "\(peerName) (you)", text: text, reliable: reliable))
        input = ""
    }

    private func add(_ message: ChatMessage) {
        messages.insert(message, at: 0)
        if messages.count > maxChatMessages {
            messages.removeLast(messages.count - maxChatMessages)
        }
    }
}

private func encodeChat(name: String, text: String) -> Data {
    (try? JSONSerialization.data(withJSONObject: ["name": name, "text": text])) ?? Data()
}

private func decodeChat(_ data: Data, reliable: Bool) -> ChatMessage {
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    let raw = String(data: data, encoding: .utf8) ?? ""
    return ChatMessage(
        sender: json?["name"] as? String ?? "unknown",
        text: json?["text"] as? String ?? raw,
        reliable: reliable
    )
}
