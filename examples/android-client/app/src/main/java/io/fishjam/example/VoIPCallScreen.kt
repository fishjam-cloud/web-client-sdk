package io.fishjam.example

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import io.fishjam.client.FishjamClient
import io.fishjam.client.PeerStatus
import io.fishjam.client.PermissionStatus
import io.fishjam.client.SandboxApi
import io.fishjam.client.SandboxRoomType
import io.fishjam.client.voip.CallEndedReason
import io.fishjam.client.voip.VoIP
import io.fishjam.client.voip.VoIPCallStatus
import io.fishjam.client.voip.VoIPEvent
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/** How long an outgoing call waits for the other phone to join before it gives up. */
private const val OUTGOING_WAIT_MS = 60_000L

@Composable
fun VoIPCallScreen() {
    val scope = rememberCoroutineScope()
    val appContext = LocalContext.current.applicationContext
    val client =
        remember {
            FishjamClient(
                context = appContext,
                fishjamId = BuildConfig.FISHJAM_ID
            )
        }
    var serverUrl by rememberSaveable { mutableStateOf("http://192.168.100.24:8787") }
    var userId by rememberSaveable { mutableStateOf("android") }
    var peerId by rememberSaveable { mutableStateOf("ios") }
    var roomName by rememberSaveable { mutableStateOf("voip-test") }
    var isVideo by rememberSaveable { mutableStateOf(false) }
    var notice by remember { mutableStateOf("") }

    val token by VoIP.token.collectAsState()
    val callStatus by VoIP.callStatus.collectAsState()
    val currentCall by VoIP.currentCall.collectAsState()
    val lastEnded by VoIP.lastEndedReason.collectAsState()
    val isOnHold by VoIP.isOnHold.collectAsState()
    val isMuted by VoIP.isMuted.collectAsState()
    val peerStatus by client.peerStatus.collectAsState()
    val roomState by client.roomState.collectAsState()
    val remotePeerCount = roomState.remotePeers.size
    var remoteJoinedCall by remember { mutableStateOf(false) }

    // The SDK does not send a hang-up to the other phone. The room is the signal: when the
    // other peer leaves during an active call, end this call as Remote.
    LaunchedEffect(callStatus, remotePeerCount) {
        if (callStatus != VoIPCallStatus.Active) {
            remoteJoinedCall = false
            return@LaunchedEffect
        }
        if (remotePeerCount > 0) {
            remoteJoinedCall = true
        } else if (remoteJoinedCall) {
            remoteJoinedCall = false
            VoIP.endCall(CallEndedReason.Remote)
        }
    }

    LaunchedEffect(callStatus) {
        when (callStatus) {
            VoIPCallStatus.Connecting -> {
                val call = currentCall ?: return@LaunchedEffect
                if (!call.isOutgoing) {
                    joinAndReport(client, call.roomName, userId, outgoing = false) { notice = it }
                }
            }
            VoIPCallStatus.Available -> {
                // Leaving the room keeps the microphone on, so the call stops it explicitly.
                if (client.isMicrophoneOn.value) client.stopMicrophone()
                if (peerStatus == PeerStatus.Connected || peerStatus == PeerStatus.Connecting) {
                    client.leaveRoom()
                }
            }
            else -> Unit
        }
    }

    // Events happen once and are not replayed, so this only updates the notice line.
    // Joining the room stays on callStatus above: a call answered before this screen opened
    // would otherwise be missed.
    LaunchedEffect(Unit) {
        VoIP.events.collect { event ->
            notice =
                when (event) {
                    is VoIPEvent.Incoming -> "Incoming call from ${event.payload.displayName}"
                    is VoIPEvent.Answered -> "Answered call from ${event.call.displayName}"
                    is VoIPEvent.Ended -> "Call ended: ${event.reason}"
                    is VoIPEvent.HeldChanged -> if (event.onHold) "On hold" else "Resumed"
                    is VoIPEvent.MuteChanged -> if (event.muted) "Muted from system UI" else "Unmuted from system UI"
                    is VoIPEvent.WaitingCallDeclined -> "Waiting call declined: ${event.payload.displayName}"
                    is VoIPEvent.TokenUpdated -> "Token updated"
                }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("VoIP push test", style = MaterialTheme.typography.titleLarge)
        Text(
            "Registers the FCM token with the local test server and starts/answers calls.",
            style = MaterialTheme.typography.bodySmall
        )
        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            label = { Text("Test server URL") },
            modifier = Modifier.fillMaxWidth().testTag("voip-server")
        )
        OutlinedTextField(
            value = userId,
            onValueChange = { userId = it },
            label = { Text("My user id") },
            modifier = Modifier.fillMaxWidth().testTag("voip-user")
        )
        OutlinedTextField(
            value = peerId,
            onValueChange = { peerId = it },
            label = { Text("Peer user id") },
            modifier = Modifier.fillMaxWidth().testTag("voip-peer")
        )
        OutlinedTextField(
            value = roomName,
            onValueChange = { roomName = it },
            label = { Text("Room name") },
            modifier = Modifier.fillMaxWidth().testTag("voip-room")
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Video call")
            Switch(checked = isVideo, onCheckedChange = { isVideo = it })
        }
        Text("Token: ${token ?: "—"}", style = MaterialTheme.typography.bodySmall)
        Text("Status: $callStatus")
        Text("Call: ${currentCall?.let { "${it.displayName} / ${it.roomName}" } ?: "—"}")
        Text("Last ended: ${lastEnded ?: "—"}")
        Text("Hold: $isOnHold  Mute: $isMuted")
        if (notice.isNotEmpty()) {
            Text(notice, style = MaterialTheme.typography.bodySmall)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    scope.launch {
                        val value = token
                        if (value == null) {
                            notice = "No FCM token yet. Wait a second and tap Register again."
                            return@launch
                        }
                        runCatching {
                            postJson(
                                serverUrl,
                                "/register",
                                JSONObject()
                                    .put("userId", userId)
                                    .put("platform", "android")
                                    .put("token", value)
                            )
                            notice = "Registered $userId"
                        }.onFailure { notice = "Register failed: ${it.message}" }
                    }
                }
            ) { Text("Register") }
            Button(
                onClick = {
                    scope.launch {
                        runCatching {
                            VoIP.startCall(peerId, roomName, isVideo)
                            postJson(
                                serverUrl,
                                "/call",
                                JSONObject()
                                    .put("from", userId)
                                    .put("to", peerId)
                                    .put("roomName", roomName)
                                    .put("isVideo", isVideo)
                            )
                            joinAndReport(client, roomName, userId, outgoing = true) { notice = it }
                        }.onFailure { notice = "Call failed: ${it.message}" }
                    }
                }
            ) { Text("Call peer") }
            OutlinedButton(onClick = { VoIP.endCall(CallEndedReason.Local) }) {
                Text("End")
            }
        }
    }
}

private suspend fun joinAndReport(
    client: FishjamClient,
    roomName: String,
    peerName: String,
    outgoing: Boolean,
    onNotice: (String) -> Unit
) {
    try {
        val peerToken =
            SandboxApi(BuildConfig.FISHJAM_SDK_API_URL).getSandboxPeerToken(
                roomName = roomName,
                peerName = peerName,
                roomType = SandboxRoomType.Conference
            )
        client.joinRoom(peerToken)
        if (outgoing) {
            // Alone in the room the call is not connected yet. Wait for the callee to join.
            onNotice("Calling... waiting for the other phone")
            val calleeJoined =
                withTimeoutOrNull(OUTGOING_WAIT_MS) {
                    client.roomState.first { it.remotePeers.isNotEmpty() }
                }
            if (calleeJoined == null) {
                VoIP.endCall(CallEndedReason.Missed)
                onNotice("No answer in $roomName")
                return
            }
        }
        startCallAudio(client)
        delay(500)
        VoIP.reportConnected()
        onNotice("Connected in $roomName")
    } catch (error: Exception) {
        VoIP.reportConnectFailed()
        onNotice("Join failed: ${error.message}")
    }
}

/** Publishes the microphone and uses the loudspeaker. Joining the room alone sends no audio. */
private suspend fun startCallAudio(client: FishjamClient) {
    if (client.queryMicrophonePermission() != PermissionStatus.Granted) {
        client.requestMicrophonePermission()
    }
    if (client.queryMicrophonePermission() == PermissionStatus.Granted && !client.isMicrophoneOn.value) {
        client.startMicrophone()
    }
}

private suspend fun postJson(baseUrl: String, path: String, body: JSONObject) {
    withContext(Dispatchers.IO) {
        val url = URL(baseUrl.trimEnd('/') + path)
        val connection =
            (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                connectTimeout = 5_000
                readTimeout = 5_000
            }
        connection.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = connection.responseCode
        connection.disconnect()
        if (code !in 200..299) {
            error("HTTP $code")
        }
    }
}
