package io.fishjam.example

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import io.fishjam.client.FishjamClient
import io.fishjam.client.PeerStatus
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private const val MAX_CHAT_MESSAGES = 50

private data class ChatMessage(val sender: String, val text: String, val reliable: Boolean)

/**
 * Text chat over the data channels. Each message is UTF-8 JSON `{"name", "text"}`,
 * because a received payload does not say which peer sent it.
 */
@Composable
fun ChatPanel(client: FishjamClient, peerName: String) {
    val peerStatus by client.peerStatus.collectAsState()
    val ready by client.dataChannelReady.collectAsState()
    val loading by client.dataChannelLoading.collectAsState()
    val error by client.dataChannelError.collectAsState()
    val scope = rememberCoroutineScope()
    val messages = remember { mutableStateListOf<ChatMessage>() }
    var reliable by remember { mutableStateOf(true) }
    var input by remember { mutableStateOf("") }

    fun add(message: ChatMessage) {
        messages.add(0, message)
        while (messages.size > MAX_CHAT_MESSAGES) messages.removeAt(messages.size - 1)
    }

    // Subscribing before the channels exist is fine: messages arrive once they open.
    DisposableEffect(client) {
        val unsubscribeReliable = client.subscribeData(reliable = true) { add(decodeChat(it, reliable = true)) }
        val unsubscribeLossy = client.subscribeData(reliable = false) { add(decodeChat(it, reliable = false)) }
        onDispose {
            unsubscribeReliable()
            unsubscribeLossy()
        }
    }

    fun send() {
        val text = input.trim()
        if (text.isEmpty()) return
        client.publishData(encodeChat(peerName, text), reliable)
        add(ChatMessage("$peerName (you)", text, reliable))
        input = ""
    }

    Column(
        modifier =
        Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(4.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Chat", style = MaterialTheme.typography.titleSmall)
            Button(
                onClick = { scope.launch { client.initializeDataChannel() } },
                enabled = peerStatus == PeerStatus.Connected && !ready && !loading,
                modifier = Modifier.testTag("chat-start")
            ) {
                Text("Start chat")
            }
        }
        Text(
            text = chatStatus(ready, loading, error),
            style = MaterialTheme.typography.bodySmall,
            color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.testTag("chat-status")
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Switch(
                checked = reliable,
                onCheckedChange = { reliable = it },
                modifier = Modifier.testTag("chat-reliable")
            )
            Text(if (reliable) "Reliable (ordered)" else "Lossy (unordered)")
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                placeholder = { Text("Type a message...") },
                singleLine = true,
                modifier = Modifier.weight(1f).testTag("chat-input")
            )
            Button(
                onClick = ::send,
                enabled = ready && input.isNotBlank(),
                modifier = Modifier.testTag("chat-send")
            ) {
                Text("Send")
            }
        }
        Column(modifier = Modifier.testTag("chat-messages"), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            messages.forEach { message ->
                val channel = if (message.reliable) "" else " [lossy]"
                Text("${message.sender}$channel: ${message.text}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun chatStatus(ready: Boolean, loading: Boolean, error: Throwable?): String = when {
    error != null -> "Error: ${error.message}"
    ready -> "Ready"
    loading -> "Loading..."
    else -> "Not started"
}

private fun encodeChat(name: String, text: String): ByteArray = buildJsonObject {
    put("name", name)
    put("text", text)
}.toString().encodeToByteArray()

private fun decodeChat(bytes: ByteArray, reliable: Boolean): ChatMessage {
    val raw = bytes.decodeToString()
    val json = runCatching { Json.parseToJsonElement(raw) as? JsonObject }.getOrNull()
    val name = (json?.get("name") as? JsonPrimitive)?.content ?: "unknown"
    val text = (json?.get("text") as? JsonPrimitive)?.content ?: raw
    return ChatMessage(name, text, reliable)
}
