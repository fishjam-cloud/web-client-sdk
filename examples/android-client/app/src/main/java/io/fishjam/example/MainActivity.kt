package io.fishjam.example

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import io.fishjam.client.AudioOutputErrorCode
import io.fishjam.client.AudioOutputException
import io.fishjam.client.BandwidthLimit
import io.fishjam.client.BandwidthLimits
import io.fishjam.client.CameraDevice
import io.fishjam.client.FishjamClient
import io.fishjam.client.inboundVideoBytesReceived
import io.fishjam.client.ObjectFit
import io.fishjam.client.PeerStatus
import io.fishjam.client.PeerWithTracks
import io.fishjam.client.PermissionStatus
import io.fishjam.client.ReconnectionStatus
import io.fishjam.client.RtcStatMember
import io.fishjam.client.RtcStats
import io.fishjam.client.Variant
import io.fishjam.client.VideoConfig
import io.fishjam.client.receivedKilobitsPerSecond
import io.fishjam.client.VideoView
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.json.JSONObject

private const val FISHJAM_ID = BuildConfig.FISHJAM_ID
private const val REQUESTING_PERMISSIONS = "Requesting permissions..."
private const val INITIALIZING_CAMERA = "Initializing camera..."
private const val PERMISSIONS_DENIED =
    "Permissions denied. Please grant camera and microphone access in settings."
private const val INIT_FAILED = "Failed to initialize camera/microphone"
private const val ROOM_MANAGER_URL = BuildConfig.FISHJAM_SDK_API_URL
private const val RECONNECTED_TOAST_MS = 3_000L
private val plainKeyboard =
    KeyboardOptions(
        capitalization = KeyboardCapitalization.None,
        autoCorrectEnabled = false
    )
private val numberKeyboard = KeyboardOptions(keyboardType = KeyboardType.Number)

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

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun JoinScreen() {
    val context = LocalContext.current
    val client =
        remember {
            FishjamClient(
                context,
                FISHJAM_ID,
                bandwidthLimits =
                    BandwidthLimits(
                        singleStreamKbps = 1500,
                        lowKbps = 150,
                        mediumKbps = 500,
                        highKbps = 1500
                    ),
                videoConfig =
                    VideoConfig(
                        sentQualities = listOf(Variant.Low, Variant.Medium, Variant.High)
                    )
            )
        }
    DisposableEffect(client) {
        onDispose { client.close() }
    }
    val scope = rememberCoroutineScope()
    val peerStatus by client.peerStatus.collectAsState()
    val reconnectionStatus by client.reconnectionStatus.collectAsState()
    val room by client.roomState.collectAsState()
    val cameraOn by client.isCameraOn.collectAsState()
    val currentCamera by client.currentCamera.collectAsState()
    val microphoneOn by client.isMicrophoneOn.collectAsState()
    val currentAudioOutput by client.currentAudioOutput.collectAsState()
    val availableAudioOutputs by client.availableAudioOutputs.collectAsState()
    var audioDialog by remember { mutableStateOf(false) }
    var hasJoinedCall by remember { mutableStateOf(false) }
    var connectionToast by remember { mutableStateOf<ConnectionToast?>(null) }
    var roomName by rememberSaveable { mutableStateOf("testtest") }
    var peerName by rememberSaveable { mutableStateOf("android") }
    var token by rememberSaveable { mutableStateOf("") }
    var notice by rememberSaveable { mutableStateOf("") }
    var permissionsDenied by remember { mutableStateOf(false) }
    val deviceSetup = remember { DeviceSetup() }
    val lifecycleOwner = LocalLifecycleOwner.current
    var mirrored by rememberSaveable { mutableStateOf(false) }
    var cover by rememberSaveable { mutableStateOf(true) }
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
    DisposableEffect(lifecycleOwner, client) {
        val observer =
            LifecycleEventObserver { _, event ->
                if (event != Lifecycle.Event.ON_RESUME) return@LifecycleEventObserver
                scope.launch {
                    prepareDevices(client, deviceSetup) { message, denied ->
                        if (message == null) {
                            if (notice == INITIALIZING_CAMERA) notice = ""
                        } else {
                            notice = message
                        }
                        permissionsDenied = denied
                    }
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
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
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = notice.ifEmpty { peerStatus.label },
                    modifier = Modifier.testTag("status")
                )
                if (peerStatus == PeerStatus.Connected) {
                    RoomCodec(client)
                }
            }
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
                singleLine = true,
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
                                client.joinRoom(
                                    token.trim(),
                                    buildJsonObject { put("name", peerName.trim()) }
                                )
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
                        try {
                            client.updatePeerMetadata(buildJsonObject { put("name", peerName.trim()) })
                        } catch (error: Exception) {
                            notice = error.message ?: "update name failed"
                        }
                    },
                    enabled = peerStatus == PeerStatus.Connected && peerName.isNotBlank(),
                    modifier = Modifier.testTag("update-name")
                ) {
                    Text("Update name")
                }
                Button(
                    onClick = {
                        notice = ""
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
                                if (cameraOn) {
                                    client.stopCamera()
                                    return@launch
                                }
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
                        scope.launch {
                            notice = ""
                            try {
                                val next = nextCamera(client.cameraDevices(), currentCamera)
                                if (next == null) {
                                    notice = "No camera found"
                                    return@launch
                                }
                                client.selectCamera(next.deviceId)
                            } catch (error: Exception) {
                                notice = error.message ?: "camera failed"
                            }
                        }
                    },
                    enabled = cameraOn,
                    modifier = Modifier.testTag("switch-camera")
                ) {
                    Text("Switch camera")
                }
                Button(
                    onClick = {
                        scope.launch {
                            notice = ""
                            try {
                                if (microphoneOn) {
                                    client.stopMicrophone()
                                    return@launch
                                }
                                if (!microphoneGranted(client)) {
                                    notice = "microphone permission denied"
                                    return@launch
                                }
                                client.startMicrophone()
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
                Button(
                    onClick = { audioDialog = true },
                    modifier = Modifier.testTag("audio")
                ) {
                    Text(currentAudioOutput?.let { "Audio: ${it.name}" } ?: "Audio")
                }
                if (permissionsDenied) {
                    Button(
                        onClick = {
                            context.startActivity(
                                Intent(
                                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    Uri.fromParts("package", context.packageName, null)
                                )
                            )
                        },
                        modifier = Modifier.testTag("settings")
                    ) {
                        Text("Open Settings")
                    }
                }
            }
            room.localPeer?.let { peer ->
                TrackBox(name = peerDisplayName(peer), nameTag = "local-name") {
                    peer.cameraTrack?.let { camera ->
                        camera.videoTrack?.let { video ->
                            VideoView(
                                track = video,
                                modifier = Modifier.fillMaxWidth().height(200.dp).testTag("local-video"),
                                mirror = currentCamera?.front == true,
                                objectFit = objectFit
                            )
                        }
                        if (camera.trackId.isNotEmpty()) {
                            CameraLimits(client = client, trackId = camera.trackId) { message ->
                                notice = message
                            }
                        }
                    }
                }
            }
            room.remotePeers.forEach { peer ->
                TrackBox(name = peerDisplayName(peer), nameTag = "remote-name") {
                    peer.cameraTrack?.let { camera ->
                        camera.videoTrack?.let { video ->
                            VideoView(
                                track = video,
                                modifier = Modifier.fillMaxWidth().height(200.dp).testTag("remote-video"),
                                mirror = mirrored,
                                objectFit = objectFit
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Received variant: ",
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false)
                                )
                                Text(
                                    text = "${variantLabel(camera.encoding)} ",
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1,
                                    modifier = Modifier.testTag("variant")
                                )
                                if (camera.trackId.isNotEmpty()) {
                                    ReceivedRate(client = client, trackId = camera.trackId)
                                }
                                Text(
                                    text = ",",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                            Text(
                                text = "Set variant:",
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1
                            )
                            CompositionLocalProvider(
                                LocalMinimumInteractiveComponentSize provides Dp.Unspecified
                            ) {
                                listOf(Variant.Low, Variant.Medium, Variant.High).forEach { variant ->
                                    OutlinedButton(
                                        onClick = {
                                            notice = ""
                                            try {
                                                client.setReceivedQuality(camera.trackId, variant)
                                            } catch (error: Exception) {
                                                notice = error.message ?: "Quality change failed"
                                            }
                                        },
                                        modifier =
                                        Modifier
                                            .defaultMinSize(minWidth = 32.dp, minHeight = 28.dp)
                                            .height(28.dp)
                                            .testTag("quality-${variant.name.lowercase()}"),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                                    ) {
                                        Text(variantLetter(variant), style = MaterialTheme.typography.labelMedium)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (audioDialog) {
            AlertDialog(
                onDismissRequest = { audioDialog = false },
                title = { Text("Audio output") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (availableAudioOutputs.isEmpty()) {
                            Text("No audio outputs")
                        }
                        availableAudioOutputs.forEach { device ->
                            TextButton(
                                onClick = {
                                    audioDialog = false
                                    scope.launch {
                                        notice = ""
                                        try {
                                            client.selectAudioOutput(device.id)
                                        } catch (error: CancellationException) {
                                            throw error
                                        } catch (error: AudioOutputException) {
                                            if (error.code != AudioOutputErrorCode.Superseded) {
                                                notice = error.message ?: "audio output failed"
                                            }
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(
                                    if (device.id == currentAudioOutput?.id) {
                                        "${device.name} (current)"
                                    } else {
                                        device.name
                                    }
                                )
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { audioDialog = false }) {
                        Text("Close")
                    }
                }
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

@Composable
private fun TrackBox(
    name: String,
    nameTag: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Box(Modifier.fillMaxWidth().padding(top = 10.dp)) {
        Column(
            modifier =
            Modifier
                .fillMaxWidth()
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(4.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            content = content
        )
        Text(
            text = name,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier =
            Modifier
                .align(Alignment.TopStart)
                .offset(x = 12.dp, y = (-8).dp)
                .background(MaterialTheme.colorScheme.surface)
                .padding(horizontal = 4.dp)
                .testTag(nameTag)
        )
    }
}

@Composable
private fun RoomCodec(client: FishjamClient) {
    var label by remember { mutableStateOf("Room codec: checking") }
    LaunchedEffect(client) {
        while (true) {
            val name = negotiatedVideoCodec(client.getStatistics(null))
            if (name != null) {
                label = "Room codec: $name"
                break
            }
            label = "Room codec: checking"
            delay(1_000)
        }
    }
    Text(text = label, modifier = Modifier.testTag("room-codec"))
}

/** Video codec in use on this connection. SDP lists every offered codec, so this follows the stream's codec id. */
private fun negotiatedVideoCodec(stats: List<RtcStats>): String? {
    val codecId =
        stats
            .firstOrNull { stat ->
                (stat.type == "outbound-rtp" || stat.type == "inbound-rtp") &&
                    stat.text("kind") == "video" &&
                    stat.text("codecId") != null
            }?.text("codecId") ?: return null
    val mime = stats.firstOrNull { stat -> stat.id == codecId }?.text("mimeType") ?: return null
    return mime.removePrefix("video/")
}

private fun RtcStats.text(key: String): String? = (members[key] as? RtcStatMember.Text)?.value

@Composable
private fun ReceivedRate(client: FishjamClient, trackId: String) {
    var label by remember(trackId) { mutableStateOf("Measuring...") }
    LaunchedEffect(client, trackId) {
        var previousBytes: Double? = null
        var previousAt = 0L
        while (true) {
            val stats = client.getStatistics(trackId)
            val bytes = inboundVideoBytesReceived(stats)
            val now = System.nanoTime()
            val previous = previousBytes
            label =
                when {
                    stats.isEmpty() -> "No stats yet"
                    bytes == null -> "No video stats"
                    previous == null -> "Measuring..."
                    else ->
                        receivedKilobitsPerSecond(previous, bytes, (now - previousAt) / 1_000_000_000.0)
                            ?.let { "$it kb/s" } ?: "Measuring..."
                }
            if (bytes != null) {
                previousBytes = bytes
                previousAt = now
            }
            delay(1_000)
        }
    }
    Text(
        text = label,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.testTag("received-kbps")
    )
}

@Composable
private fun CameraLimits(
    client: FishjamClient,
    trackId: String,
    report: (String) -> Unit
) {
    var shown by rememberSaveable { mutableStateOf(false) }
    var lowText by rememberSaveable { mutableStateOf("150") }
    var mediumText by rememberSaveable { mutableStateOf("500") }
    var highText by rememberSaveable { mutableStateOf("1500") }
    var sendingLow by rememberSaveable { mutableStateOf(150) }
    var sendingMedium by rememberSaveable { mutableStateOf(500) }
    var sendingHigh by rememberSaveable { mutableStateOf(1500) }
    val focusManager = LocalFocusManager.current
    Button(
        onClick = { shown = !shown },
        modifier = Modifier.testTag("camera-limits-toggle")
    ) {
        Text(if (shown) "Hide camera limits" else "Show camera limits")
    }
    if (!shown) return
    Text(
        text = "Now sending low $sendingLow kb/s, medium $sendingMedium kb/s, high $sendingHigh kb/s",
        modifier = Modifier.testTag("camera-limits-now")
    )
    OutlinedTextField(
        value = lowText,
        onValueChange = { lowText = it.filter(Char::isDigit) },
        label = { Text("Low kb/s") },
        keyboardOptions = numberKeyboard,
        modifier = Modifier.fillMaxWidth().testTag("camera-limit-low")
    )
    OutlinedTextField(
        value = mediumText,
        onValueChange = { mediumText = it.filter(Char::isDigit) },
        label = { Text("Medium kb/s") },
        keyboardOptions = numberKeyboard,
        modifier = Modifier.fillMaxWidth().testTag("camera-limit-medium")
    )
    OutlinedTextField(
        value = highText,
        onValueChange = { highText = it.filter(Char::isDigit) },
        label = { Text("High kb/s") },
        keyboardOptions = numberKeyboard,
        modifier = Modifier.fillMaxWidth().testTag("camera-limit-high")
    )
    Button(
        onClick = {
            focusManager.clearFocus()
            val low = lowText.toIntOrNull()
            val medium = mediumText.toIntOrNull()
            val high = highText.toIntOrNull()
            if (low == null || medium == null || high == null) {
                report("Enter a kb/s number for each layer")
                return@Button
            }
            try {
                client.setTrackBandwidth(trackId, BandwidthLimit.Layers(low, medium, high))
                sendingLow = low
                sendingMedium = medium
                sendingHigh = high
                report("")
            } catch (error: Exception) {
                report(error.message ?: "Bandwidth change failed")
            }
        },
        modifier = Modifier.testTag("set-layers")
    ) {
        Text("Set layers")
    }
}

private fun variantLabel(variant: Variant?): String = when (variant) {
    Variant.Low -> "Low"
    Variant.Medium -> "Medium"
    Variant.High -> "High"
    null -> "Auto"
}

private fun variantLetter(variant: Variant): String = when (variant) {
    Variant.Low -> "L"
    Variant.Medium -> "M"
    Variant.High -> "H"
}

private fun peerDisplayName(peer: PeerWithTracks): String {
    val name = (peer.metadata?.peer as? JsonObject)?.get("name") as? JsonPrimitive
    return name?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() } ?: peer.id
}

private fun nextCamera(cameras: List<CameraDevice>, current: CameraDevice?): CameraDevice? {
    if (current == null) return cameras.firstOrNull()
    cameras.firstOrNull { camera -> camera.front != current.front }?.let { return it }
    return cameras.firstOrNull { camera -> camera.deviceId != current.deviceId }
}

private class DeviceSetup {
    var requestedPermissions = false
    var devicesReady = false
    val lock = Mutex()
}

private suspend fun prepareDevices(
    client: FishjamClient,
    setup: DeviceSetup,
    onStatus: (message: String?, permissionsDenied: Boolean) -> Unit
) {
    setup.lock.withLock {
        if (setup.devicesReady) return
        var camera = client.queryCameraPermission()
        var microphone = client.queryMicrophonePermission()
        if (!setup.requestedPermissions) {
            setup.requestedPermissions = true
            onStatus(REQUESTING_PERMISSIONS, false)
            if (camera != PermissionStatus.Granted) camera = client.requestCameraPermission()
            if (microphone != PermissionStatus.Granted) microphone = client.requestMicrophonePermission()
        }
        if (camera != PermissionStatus.Granted || microphone != PermissionStatus.Granted) {
            onStatus(PERMISSIONS_DENIED, true)
            return
        }
        onStatus(INITIALIZING_CAMERA, false)
        try {
            client.initializeDevices(enableVideo = true, enableAudio = true)
            setup.devicesReady = true
            onStatus(null, false)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            onStatus(INIT_FAILED, false)
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
