package io.fishjam.example

import android.Manifest
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import io.fishjam.client.VideoView
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private const val FISHJAM_ID = BuildConfig.FISHJAM_ID
private const val ROOM_MANAGER_URL = BuildConfig.FISHJAM_SDK_API_URL
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
    val room by client.roomState.collectAsState()
    var roomName by rememberSaveable { mutableStateOf("testtest") }
    var peerName by rememberSaveable { mutableStateOf("android") }
    var token by rememberSaveable { mutableStateOf("") }
    var notice by rememberSaveable { mutableStateOf("") }
    var mirrored by rememberSaveable { mutableStateOf(false) }
    var cover by rememberSaveable { mutableStateOf(true) }
    val objectFit = if (cover) ObjectFit.Cover else ObjectFit.Contain
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val cameraPermission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                scope.launch {
                    notice = ""
                    try {
                        client.startCamera()
                    } catch (error: Exception) {
                        notice = error.message ?: "camera failed"
                    }
                }
            } else {
                notice = "camera permission denied"
            }
        }
    val microphonePermission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                scope.launch {
                    notice = ""
                    try {
                        client.startMicrophone()
                    } catch (error: Exception) {
                        notice = error.message ?: "microphone failed"
                    }
                }
            } else {
                notice = "microphone permission denied"
            }
        }

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
                    client.leaveRoom()
                },
                enabled = peerStatus != PeerStatus.Idle,
                modifier = Modifier.testTag("leave")
            ) {
                Text("Leave")
            }
            Button(
                onClick = { cameraPermission.launch(Manifest.permission.CAMERA) },
                modifier = Modifier.testTag("camera")
            ) {
                Text("Camera")
            }
            Button(
                onClick = { microphonePermission.launch(Manifest.permission.RECORD_AUDIO) },
                modifier = Modifier.testTag("microphone")
            ) {
                Text("Microphone")
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
            text = notice.ifEmpty { peerStatus.name.lowercase() },
            modifier = Modifier.testTag("status")
        )
    }
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
