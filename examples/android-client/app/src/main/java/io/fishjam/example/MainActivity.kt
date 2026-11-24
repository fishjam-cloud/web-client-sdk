package io.fishjam.example

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import io.fishjam.client.AudioOutputErrorCode
import io.fishjam.client.AudioOutputException
import io.fishjam.client.BandwidthLimit
import io.fishjam.client.BandwidthLimits
import io.fishjam.client.CameraDevice
import io.fishjam.client.FishjamClient
import io.fishjam.client.ForegroundService
import io.fishjam.client.ForegroundServiceConfig
import io.fishjam.client.ObjectFit
import io.fishjam.client.PeerStatus
import io.fishjam.client.PeerWithTracks
import io.fishjam.client.PermissionStatus
import io.fishjam.client.PictureInPictureController
import io.fishjam.client.ReconnectionStatus
import io.fishjam.client.RtcStatMember
import io.fishjam.client.RtcStats
import io.fishjam.client.SandboxApi
import io.fishjam.client.SandboxRoomType
import io.fishjam.client.SandboxVideoCodec
import io.fishjam.client.Variant
import io.fishjam.client.VideoConfig
import io.fishjam.client.VideoView
import io.fishjam.client.inboundVideoBytesReceived
import io.fishjam.client.receivedKilobitsPerSecond
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private const val FISHJAM_ID = BuildConfig.FISHJAM_ID
private const val REQUESTING_PERMISSIONS = "Requesting permissions..."
private const val INITIALIZING_CAMERA = "Initializing camera..."
private const val PERMISSIONS_DENIED =
    "Permissions denied. Please grant camera and microphone access in settings."
private const val INIT_FAILED = "Failed to initialize camera/microphone"
private const val RECONNECTED_TOAST_MS = 3_000L
internal val sandboxCodecs = listOf("Default", "VP8", "H264")
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
                ExampleTabs()
            }
        }
    }
}

private enum class ExampleScreen { Home, Room, Livestream }

@OptIn(ExperimentalComposeUiApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun ExampleTabs() {
    var screenName by rememberSaveable { mutableStateOf(ExampleScreen.Home.name) }
    val screen = ExampleScreen.valueOf(screenName)
    val livestream = screen == ExampleScreen.Livestream
    val context = LocalContext.current
    val view = LocalView.current
    val darkTheme = isSystemInDarkTheme()
    BackHandler(enabled = screen != ExampleScreen.Home) {
        screenName = ExampleScreen.Home.name
    }
    SideEffect {
        val window = (context as ComponentActivity).window
        WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars =
            livestream || !darkTheme
    }
    Scaffold(
        modifier = Modifier.semantics { testTagsAsResourceId = true },
        containerColor = if (livestream) livestreamBackground else Color.White,
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = {
            if (screen != ExampleScreen.Home) {
                TopAppBar(
                    title = { Text(screen.name) },
                    navigationIcon = {
                        IconButton(onClick = { screenName = ExampleScreen.Home.name }) {
                            Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                )
            }
        }
    ) { innerPadding ->
        Box(Modifier.padding(innerPadding).fillMaxSize()) {
            when (screen) {
                ExampleScreen.Home ->
                    ExampleMenu(open = { screenName = it.name })
                ExampleScreen.Room -> JoinScreen()
                ExampleScreen.Livestream -> LivestreamViewerScreen()
            }
        }
    }
}

@Composable
private fun ExampleMenu(open: (ExampleScreen) -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Fishjam example", style = MaterialTheme.typography.headlineSmall)
        Text("The microphone and camera start only after you open Room.")
        Button(onClick = { open(ExampleScreen.Room) }, modifier = Modifier.fillMaxWidth().testTag("open-room")) {
            Icon(Icons.Filled.Videocam, contentDescription = null)
            Text("Room")
        }
        Button(onClick = { open(ExampleScreen.Livestream) }, modifier = Modifier.fillMaxWidth().testTag("open-livestream")) {
            Icon(Icons.Filled.Radio, contentDescription = null)
            Text("Livestream")
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
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
        onDispose {
            ForegroundService.stop(context)
            client.close()
        }
    }
    val pip = remember(client) { PictureInPictureController(context as ComponentActivity, client) }
    DisposableEffect(pip) { onDispose { pip.close() } }
    val pipActive by pip.isActive.collectAsState()
    val scope = rememberCoroutineScope()
    val peerStatus by client.peerStatus.collectAsState()
    val reconnectionStatus by client.reconnectionStatus.collectAsState()
    val room by client.roomState.collectAsState()
    val speaking by client.voiceActivity.collectAsState()
    val cameraOn by client.isCameraOn.collectAsState()
    val currentCamera by client.currentCamera.collectAsState()
    val microphoneOn by client.isMicrophoneOn.collectAsState()
    val screenSharing by client.isScreenSharing.collectAsState()
    val currentAudioOutput by client.currentAudioOutput.collectAsState()
    val availableAudioOutputs by client.availableAudioOutputs.collectAsState()
    var audioDialog by remember { mutableStateOf(false) }
    var hasJoinedCall by remember { mutableStateOf(false) }
    var connectionToast by remember { mutableStateOf<ConnectionToast?>(null) }
    var roomName by rememberSaveable { mutableStateOf("testtest") }
    var peerName by rememberSaveable { mutableStateOf("android") }
    var roomTypeName by rememberSaveable { mutableStateOf(SandboxRoomType.Conference.name) }
    var codecName by rememberSaveable { mutableStateOf("Default") }
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
    // The foreground service keeps the call running while the app is in the background.
    LaunchedEffect(peerStatus) {
        when (peerStatus) {
            PeerStatus.Connected ->
                ForegroundService.start(
                    context,
                    ForegroundServiceConfig(
                        enableCamera = true,
                        enableMicrophone = true,
                        enableScreenSharing = true,
                        notificationTitle = "Fishjam example",
                        notificationContent = "Your call is ongoing. Tap to return."
                    )
                )
            PeerStatus.Idle -> ForegroundService.stop(context)
            else -> Unit
        }
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
            SandboxMenu(
                label = "Room type",
                options = SandboxRoomType.entries,
                selected = SandboxRoomType.valueOf(roomTypeName),
                optionLabel = { it.label },
                onSelected = { roomTypeName = it.name },
                tag = "room-type"
            )
            SandboxMenu(
                label = "Video codec",
                options = sandboxCodecs,
                selected = codecName,
                optionLabel = { it },
                onSelected = { codecName = it },
                tag = "video-codec"
            )
            Text("Not for production.", modifier = Modifier.testTag("sandbox-warning"))
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
                                token =
                                    SandboxApi(BuildConfig.FISHJAM_SDK_API_URL).getSandboxPeerToken(
                                        roomName = roomName.trim(),
                                        peerName = peerName.trim(),
                                        roomType = SandboxRoomType.valueOf(roomTypeName),
                                        videoCodec = sandboxVideoCodec(codecName)
                                    )
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
                        scope.launch {
                            notice = ""
                            try {
                                if (screenSharing) client.stopScreenShare()
                            } catch (error: Exception) {
                                notice = error.message ?: "screen share failed"
                                return@launch
                            }
                            // Clear this before leaveRoom, so the Idle status that follows
                            // is not treated as an unexpected disconnect.
                            hasJoinedCall = false
                            connectionToast = null
                            client.leaveRoom()
                        }
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
                    onClick = {
                        scope.launch {
                            notice = ""
                            try {
                                if (screenSharing) {
                                    client.stopScreenShare()
                                } else {
                                    client.startScreenShare()
                                }
                            } catch (error: Exception) {
                                notice = error.message ?: "screen share failed"
                            }
                        }
                    },
                    enabled = peerStatus == PeerStatus.Connected,
                    modifier = Modifier.testTag("screen-share")
                ) {
                    Text(if (screenSharing) "Screen share on" else "Screen share off")
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
                Button(
                    onClick = { if (pipActive) pip.stopPIP() else pip.startPIP() },
                    enabled = peerStatus == PeerStatus.Connected,
                    modifier = Modifier.testTag("pip")
                ) {
                    Text(if (pipActive) "Stop PiP" else "Start PiP")
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
                TrackBox(
                    name = peerDisplayName(peer),
                    nameTag = "local-name",
                    speaking = speaking[peer.id] == true
                ) {
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
                    peer.screenShareVideoTrack?.let { screen ->
                        screen.videoTrack?.let { video ->
                            VideoView(
                                track = video,
                                modifier = Modifier.fillMaxWidth().height(200.dp).testTag("local-screen-share"),
                                objectFit = ObjectFit.Contain
                            )
                        }
                        if (screen.trackId.isNotEmpty()) {
                            SentRate(
                                client = client,
                                trackId = screen.trackId,
                                webrtcTrackId = screen.videoTrack?.id().orEmpty()
                            )
                        }
                    }
                }
            }
            room.remotePeers.forEach { peer ->
                TrackBox(
                    name = peerDisplayName(peer),
                    nameTag = "remote-name",
                    speaking = speaking[peer.id] == true
                ) {
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
                    peer.screenShareVideoTrack?.let { screen ->
                        screen.videoTrack?.let { video ->
                            VideoView(
                                track = video,
                                modifier = Modifier.fillMaxWidth().height(200.dp).testTag("remote-screen-share"),
                                objectFit = ObjectFit.Contain
                            )
                        }
                        if (screen.trackId.isNotEmpty()) {
                            ReceivedRate(
                                client = client,
                                trackId = screen.trackId,
                                webrtcTrackId = screen.videoTrack?.id().orEmpty(),
                                prefix = "Received: "
                            )
                        }
                    }
                }
            }
            EventLogPanel(client)
        }
        if (audioDialog) {
            AlertDialog(
                onDismissRequest = { audioDialog = false },
                modifier = Modifier.semantics { testTagsAsResourceId = true }.testTag("audio-output-dialog"),
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
                                modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .testTag("audio-output-${device.type.name.lowercase()}")
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
                    TextButton(
                        onClick = { audioDialog = false },
                        modifier = Modifier.testTag("audio-output-close")
                    ) {
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
    speaking: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(4.dp)
    Box(Modifier.fillMaxWidth().padding(top = 10.dp)) {
        Box(
            Modifier
                .matchParentSize()
                .border(
                    width = if (speaking) 3.dp else 1.dp,
                    color = if (speaking) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline,
                    shape = shape
                ).then(if (speaking) Modifier.testTag("speaking") else Modifier)
        )
        Column(
            modifier =
            Modifier
                .fillMaxWidth()
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

private fun RtcStats.number(key: String): Double? = (members[key] as? RtcStatMember.Number)?.value

@Composable
private fun ReceivedRate(client: FishjamClient, trackId: String, webrtcTrackId: String = "", prefix: String = "") {
    var label by remember(trackId) { mutableStateOf("Measuring...") }
    LaunchedEffect(client, trackId, webrtcTrackId) {
        var previousBytes: Double? = null
        var previousAt = 0L
        while (true) {
            val stats = client.getStatistics(trackId)
            val bytes = inboundBytes(stats, webrtcTrackId)
            val now = System.nanoTime()
            val previous = previousBytes
            label =
                when {
                    stats.isEmpty() -> "${prefix}No stats yet"
                    bytes == null -> "${prefix}No video stats"
                    previous == null -> "${prefix}Measuring..."
                    else ->
                        receivedKilobitsPerSecond(previous, bytes, (now - previousAt) / 1_000_000_000.0)
                            ?.let { "$prefix$it kb/s" } ?: "${prefix}Measuring..."
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
private fun SentRate(client: FishjamClient, trackId: String, webrtcTrackId: String) {
    var label by remember(trackId) { mutableStateOf("Measuring...") }
    LaunchedEffect(client, trackId, webrtcTrackId) {
        var previousBytes: Double? = null
        var previousAt = 0L
        while (true) {
            val scoped = client.getStatistics(trackId)
            var bytes = outboundBytes(scoped, webrtcTrackId)
            val all = if (bytes == null) client.getStatistics(null) else emptyList()
            if (bytes == null) bytes = outboundBytes(all, webrtcTrackId)
            val now = System.nanoTime()
            val previous = previousBytes
            val rate =
                when {
                    scoped.isEmpty() && all.isEmpty() -> "No stats yet"
                    bytes == null -> "No video stats"
                    previous == null -> "Measuring..."
                    else ->
                        receivedKilobitsPerSecond(previous, bytes, (now - previousAt) / 1_000_000_000.0)
                            ?.let { "$it kb/s" } ?: "Measuring..."
                }
            label = "Sent: $rate"
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
        modifier = Modifier.testTag("sent-kbps")
    )
}

private fun inboundBytes(stats: List<RtcStats>, webrtcTrackId: String): Double? {
    if (webrtcTrackId.isEmpty()) return inboundVideoBytesReceived(stats)
    return bytesForTrack(stats, webrtcTrackId, sent = false) ?: inboundVideoBytesReceived(stats)
}

private fun outboundBytes(stats: List<RtcStats>, webrtcTrackId: String): Double? =
    bytesForTrack(stats, webrtcTrackId, sent = true)

/** Bytes for this WebRTC track. A report with one video stream is that stream. */
private fun bytesForTrack(stats: List<RtcStats>, webrtcTrackId: String, sent: Boolean): Double? {
    val type = if (sent) "outbound-rtp" else "inbound-rtp"
    val counter = if (sent) "bytesSent" else "bytesReceived"
    val streams =
        stats.filter { stat ->
            stat.type == type && stat.number(counter) != null && stat.text("kind") != "audio"
        }
    if (webrtcTrackId.isNotEmpty()) {
        streams.firstOrNull { it.text("trackIdentifier") == webrtcTrackId }?.number(counter)?.let { return it }
        streams.firstOrNull { it.text("trackId") == webrtcTrackId }?.number(counter)?.let { return it }
        val sourceIds =
            stats
                .filter { it.type == "media-source" && it.text("trackIdentifier") == webrtcTrackId }
                .map { it.id }
                .toSet()
        streams.firstOrNull { it.text("mediaSourceId") in sourceIds }?.number(counter)?.let { return it }
        val trackStatIds =
            stats
                .filter { it.type == "track" && it.text("trackIdentifier") == webrtcTrackId }
                .map { it.id }
                .toSet()
        streams.firstOrNull { it.text("trackId") in trackStatIds }?.number(counter)?.let { return it }
    }
    val only = streams.singleOrNull() ?: return null
    return if (only.text("kind") == null || only.text("kind") == "video") only.number(counter) else null
}

@Composable
private fun CameraLimits(client: FishjamClient, trackId: String, report: (String) -> Unit) {
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

private val SandboxRoomType.label: String
    get() =
        when (this) {
            SandboxRoomType.Conference -> "Conference"
            SandboxRoomType.AudioOnly -> "Audio only"
            SandboxRoomType.Livestream -> "Livestream"
        }

internal fun sandboxVideoCodec(name: String): SandboxVideoCodec? = when (name) {
    "VP8" -> SandboxVideoCodec.Vp8
    "H264" -> SandboxVideoCodec.H264
    else -> null
}
