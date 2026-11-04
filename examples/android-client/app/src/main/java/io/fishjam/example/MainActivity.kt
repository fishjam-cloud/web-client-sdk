package io.fishjam.example

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import io.fishjam.client.FishjamClient
import io.fishjam.client.ObjectFit
import io.fishjam.client.PeerStatus
import io.fishjam.client.PermissionStatus
import io.fishjam.client.ReconnectionStatus
import io.fishjam.client.VideoView
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private const val FISHJAM_ID = BuildConfig.FISHJAM_ID
private const val ROOM_MANAGER_URL = BuildConfig.FISHJAM_SDK_API_URL
private const val RECONNECTED_TOAST_MS = 3_000L
private val plainKeyboard =
    KeyboardOptions(
        capitalization = KeyboardCapitalization.None,
        autoCorrectEnabled = false
    )

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    JoinScreen()
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun JoinScreen() {
    val context = LocalContext.current
    val client = remember { FishjamClient(context, FISHJAM_ID) }
    DisposableEffect(client) {
        onDispose { client.close() }
    }
    val scope = rememberCoroutineScope()
    val peerStatus by client.peerStatus.collectAsState()
    val reconnectionStatus by client.reconnectionStatus.collectAsState()
    val room by client.roomState.collectAsState()
    var hasJoinedCall by remember { mutableStateOf(false) }
    var connectionToast by remember { mutableStateOf<ConnectionToast?>(null) }
    var roomName by rememberSaveable { mutableStateOf("testtest") }
    var peerName by rememberSaveable { mutableStateOf("android") }
    var token by rememberSaveable { mutableStateOf("") }
    var notice by rememberSaveable { mutableStateOf("") }
    var mirrored by rememberSaveable { mutableStateOf(false) }
    var cover by rememberSaveable { mutableStateOf(true) }
    var microphoneOn by remember { mutableStateOf(false) }
    var captureEpoch by remember { mutableIntStateOf(0) }
    val cameraOn = room.localPeer?.cameraTrack?.videoTrack != null
    val objectFit = if (cover) ObjectFit.Cover else ObjectFit.Contain
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current

    LaunchedEffect(peerStatus, reconnectionStatus) {
        val decision =
            decideConnectionToast(
                hasJoinedCall = hasJoinedCall,
                peerStatus = peerStatus,
                reconnectionStatus = reconnectionStatus,
                current = connectionToast
            )
        hasJoinedCall = decision.hasJoinedCall
        connectionToast = decision.toast
    }
    LaunchedEffect(connectionToast) {
        if (connectionToast == ConnectionToast.Reconnected) {
            delay(RECONNECTED_TOAST_MS)
            connectionToast = null
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier =
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .pointerInput(Unit) {
                    awaitEachGesture {
                        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                        val up = waitForUpOrCancellation(pass = PointerEventPass.Final)
                        if (up != null && !up.isConsumed) {
                            focusManager.clearFocus()
                            keyboard?.hide()
                        }
                    }
                }
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("Fishjam example", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(
                value = roomName,
                onValueChange = { roomName = it },
                label = { Text("Room name") },
                keyboardOptions = plainKeyboard,
                modifier = Modifier.fillMaxWidth().testTag("room")
            )
            OutlinedTextField(
                value = peerName,
                onValueChange = { peerName = it },
                label = { Text("Peer name") },
                keyboardOptions = plainKeyboard,
                modifier = Modifier.fillMaxWidth().testTag("peer")
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        scope.launch {
                            notice = ""
                            try {
                                token = fetchPeerToken(roomName.trim(), peerName.trim())
                            } catch (error: Exception) {
                                notice = error.message ?: "token request failed"
                            }
                        }
                    },
                    enabled = roomName.isNotBlank() && peerName.isNotBlank(),
                    modifier = Modifier.testTag("fetch")
                ) {
                    Text("Fetch token")
                }
            }
            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("Token") },
                keyboardOptions = plainKeyboard,
                modifier = Modifier.fillMaxWidth().testTag("token")
            )
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        scope.launch {
                            notice = ""
                            try {
                                client.joinRoom(token.trim())
                            } catch (error: Exception) {
                                notice = error.message ?: "join failed"
                            }
                        }
                    },
                    enabled = token.isNotBlank() && peerStatus != PeerStatus.Connected,
                    modifier = Modifier.testTag("join")
                ) {
                    Text("Join")
                }
                Button(
                    onClick = {
                        notice = ""
                        captureEpoch += 1
                        microphoneOn = false
                        // Clear this before leaveRoom, so the Idle status that follows
                        // is not treated as an unexpected disconnect.
                        hasJoinedCall = false
                        connectionToast = null
                        client.leaveRoom()
                    },
                    enabled = peerStatus != PeerStatus.Idle,
                    modifier = Modifier.testTag("leave")
                ) {
                    Text("Leave")
                }
                Button(
                    onClick = {
                        scope.launch {
                            notice = ""
                            try {
                                if (!cameraGranted(client)) {
                                    notice = "camera permission denied"
                                    return@launch
                                }
                                client.startCamera()
                            } catch (error: Exception) {
                                notice = error.message ?: "camera failed"
                            }
                        }
                    },
                    modifier = Modifier.testTag("camera")
                ) {
                    Text(if (cameraOn) "Camera on" else "Camera off")
                }
                Button(
                    onClick = {
                        val epoch = captureEpoch
                        scope.launch {
                            notice = ""
                            try {
                                if (!microphoneGranted(client)) {
                                    notice = "microphone permission denied"
                                    return@launch
                                }
                                client.startMicrophone()
                                if (epoch == captureEpoch) microphoneOn = true
                            } catch (error: Exception) {
                                notice = error.message ?: "microphone failed"
                            }
                        }
                    },
                    modifier = Modifier.testTag("microphone")
                ) {
                    Text(if (microphoneOn) "Microphone on" else "Microphone off")
                }
                Button(
                    onClick = { mirrored = !mirrored },
                    modifier = Modifier.testTag("mirror")
                ) {
                    Text(if (mirrored) "Mirror on" else "Mirror off")
                }
                Button(
                    onClick = { cover = false },
                    modifier = Modifier.testTag("contain")
                ) {
                    Text("Contain")
                }
                Button(
                    onClick = { cover = true },
                    modifier = Modifier.testTag("cover")
                ) {
                    Text("Cover")
                }
            }
            room.localPeer?.cameraTrack?.videoTrack?.let { video ->
                VideoView(
                    track = video,
                    modifier = Modifier.fillMaxWidth().height(200.dp).testTag("local-video"),
                    mirror = !mirrored,
                    objectFit = objectFit
                )
            }
            room.remotePeers.forEach { peer ->
                val video = peer.cameraTrack?.videoTrack ?: return@forEach
                VideoView(
                    track = video,
                    modifier = Modifier.fillMaxWidth().height(200.dp).testTag("remote-video"),
                    mirror = mirrored,
                    objectFit = objectFit
                )
            }
            Text(
                text = notice.ifEmpty { peerStatus.label },
                modifier = Modifier.testTag("status")
            )
        }
        connectionToast?.let { toast ->
            ConnectionToastBanner(
                toast = toast,
                modifier =
                Modifier
                    .align(Alignment.TopCenter)
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(top = 8.dp)
            )
        }
    }
}

private suspend fun cameraGranted(client: FishjamClient): Boolean {
    var status = client.queryCameraPermission()
    if (status != PermissionStatus.Granted) status = client.requestCameraPermission()
    return status == PermissionStatus.Granted
}

private suspend fun microphoneGranted(client: FishjamClient): Boolean {
    var status = client.queryMicrophonePermission()
    if (status != PermissionStatus.Granted) status = client.requestMicrophonePermission()
    return status == PermissionStatus.Granted
}

private enum class ConnectionToast {
    Disconnected,
    Reconnecting,
    Reconnected
}

private data class ToastDecision(
    val hasJoinedCall: Boolean,
    val toast: ConnectionToast?,
    val autoDismiss: Boolean
)

/**
 * Toast rules for the example app:
 * - nothing until the first successful join
 * - "Reconnecting" and "Disconnected" stay until the call is connected again
 * - "Reconnected" is only for an automatic retry that succeeded; the caller
 *   hides it after a few seconds when [ToastDecision.autoDismiss] is true
 * - a manual leave sets `hasJoinedCall` to false before this runs, so the
 *   Idle that follows does not show a toast
 */
private fun decideConnectionToast(
    hasJoinedCall: Boolean,
    peerStatus: PeerStatus,
    reconnectionStatus: ReconnectionStatus,
    current: ConnectionToast?
): ToastDecision {
    if (!hasJoinedCall) {
        return ToastDecision(
            hasJoinedCall = peerStatus == PeerStatus.Connected,
            toast = null,
            autoDismiss = false
        )
    }
    return when (reconnectionStatus) {
        ReconnectionStatus.Reconnecting ->
            ToastDecision(hasJoinedCall = true, toast = ConnectionToast.Reconnecting, autoDismiss = false)
        ReconnectionStatus.Error ->
            ToastDecision(hasJoinedCall = true, toast = ConnectionToast.Disconnected, autoDismiss = false)
        ReconnectionStatus.Idle ->
            when (peerStatus) {
                is PeerStatus.Error ->
                    if (current == ConnectionToast.Reconnecting) {
                        // ReconnectionStatus.Idle is emitted just before PeerStatus
                        // becomes Connected. Keep showing reconnecting across that gap.
                        ToastDecision(hasJoinedCall = true, toast = current, autoDismiss = false)
                    } else {
                        ToastDecision(hasJoinedCall = true, toast = ConnectionToast.Disconnected, autoDismiss = false)
                    }
                PeerStatus.Connected ->
                    when (current) {
                        ConnectionToast.Reconnecting ->
                            ToastDecision(hasJoinedCall = true, toast = ConnectionToast.Reconnected, autoDismiss = true)
                        ConnectionToast.Disconnected ->
                            ToastDecision(hasJoinedCall = true, toast = null, autoDismiss = false)
                        else ->
                            ToastDecision(hasJoinedCall = true, toast = current, autoDismiss = false)
                    }
                PeerStatus.Idle ->
                    ToastDecision(hasJoinedCall = true, toast = ConnectionToast.Disconnected, autoDismiss = false)
                PeerStatus.Connecting ->
                    ToastDecision(hasJoinedCall = true, toast = current, autoDismiss = false)
            }
    }
}

@Composable
private fun ConnectionToastBanner(toast: ConnectionToast, modifier: Modifier = Modifier) {
    val label =
        when (toast) {
            ConnectionToast.Disconnected -> "Disconnected"
            ConnectionToast.Reconnecting -> "Reconnecting"
            ConnectionToast.Reconnected -> "Reconnected"
        }
    val background =
        when (toast) {
            ConnectionToast.Disconnected -> Color(0xFFB3261E)
            ConnectionToast.Reconnecting -> Color(0xFF8D6A00)
            ConnectionToast.Reconnected -> Color(0xFF1B7F4E)
        }
    Text(
        text = label,
        color = Color.White,
        modifier =
        modifier
            .shadow(8.dp, RoundedCornerShape(20.dp))
            .background(background, RoundedCornerShape(20.dp))
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .testTag("connection-toast")
    )
}

internal suspend fun fetchPeerToken(roomName: String, peerName: String): String = withContext(Dispatchers.IO) {
    val url =
        Uri
            .parse(ROOM_MANAGER_URL)
            .buildUpon()
            .appendQueryParameter("roomName", roomName)
            .appendQueryParameter("peerName", peerName)
            .appendQueryParameter("roomType", "conference")
            .build()
            .toString()
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
        connection.requestMethod = "GET"
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        val body = stream.bufferedReader().readText()
        if (connection.responseCode !in 200..299) {
            error("token request failed: ${connection.responseCode} $body")
        }
        JSONObject(body).getString("peerToken")
    } finally {
        connection.disconnect()
    }
}
