package io.fishjam.example

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import io.fishjam.client.FishjamClient
import io.fishjam.client.ForegroundService
import io.fishjam.client.ForegroundServiceConfig
import io.fishjam.client.InitializeDevicesStatus
import io.fishjam.client.LivestreamError
import io.fishjam.client.LivestreamException
import io.fishjam.client.LivestreamStreamer
import io.fishjam.client.ObjectFit
import io.fishjam.client.SandboxApi
import io.fishjam.client.VideoView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.webrtc.AudioTrack
import org.webrtc.VideoTrack

private val streamerPlainText =
    KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false)

// Screen capture needs the foreground service running before it starts.
private val streamerServiceConfig =
    ForegroundServiceConfig(
        enableCamera = true,
        enableMicrophone = true,
        enableScreenSharing = true,
        notificationTitle = "Fishjam example",
        notificationContent = "Your livestream is ongoing. Tap to return."
    )

@Composable
fun LivestreamStreamerScreen() {
    val context = LocalContext.current
    val client = remember { FishjamClient(context, BuildConfig.FISHJAM_ID) }
    val streamer = remember(client) { LivestreamStreamer(client) }
    DisposableEffect(client) {
        onDispose {
            ForegroundService.stop(context)
            streamer.close()
            client.close()
        }
    }
    val scope = rememberCoroutineScope()
    val isConnected by streamer.isConnected.collectAsState()
    val error by streamer.error.collectAsState()
    val screenSharing by client.isScreenSharing.collectAsState()
    var roomName by rememberSaveable { mutableStateOf("testtest") }
    var notice by rememberSaveable { mutableStateOf("") }
    var connecting by remember { mutableStateOf(false) }
    var devicesReady by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<VideoTrack?>(null) }
    var screen by remember { mutableStateOf<VideoTrack?>(null) }
    var audio by remember { mutableStateOf<AudioTrack?>(null) }
    var screenMode by rememberSaveable { mutableStateOf(false) }
    var token by remember { mutableStateOf<String?>(null) }
    var connectJob by remember { mutableStateOf<Job?>(null) }

    val preview = if (screenMode) screen else camera

    LaunchedEffect(client) {
        val result = client.initializeDevices(enableVideo = true, enableAudio = true)
        if (result.status == InitializeDevicesStatus.Failed) {
            notice = "Camera and microphone permission denied"
            return@LaunchedEffect
        }
        try {
            camera = client.startCamera()
        } catch (failure: Exception) {
            notice = failure.message ?: "Could not start the camera"
        }
        try {
            audio = client.startMicrophone()
        } catch (failure: Exception) {
            val message = failure.message ?: "Could not start the microphone"
            notice = if (notice.isEmpty()) message else "$notice $message"
        }
        devicesReady = camera != null || audio != null
    }

    // The system stop control ends screen sharing. Stop the stream too, and go back to the camera.
    LaunchedEffect(screenSharing) {
        if (!screenSharing && screenMode) {
            streamer.disconnect()
            screenMode = false
            screen = null
        }
    }

    // Replaces the live stream's video. Does nothing when not streaming.
    suspend fun reconnect(track: VideoTrack?) {
        val streamToken = token ?: return
        if (!streamer.isConnected.value) return
        if (track == null && audio == null) {
            streamer.disconnect()
            return
        }
        streamer.connect(video = track, audio = audio, token = streamToken)
    }

    fun start() {
        connectJob?.cancel()
        notice = ""
        connecting = true
        connectJob =
            scope.launch {
                try {
                    val streamToken =
                        SandboxApi(BuildConfig.FISHJAM_SDK_API_URL)
                            .getSandboxLivestream(roomName.trim())
                            .streamerToken
                    token = streamToken
                    val video = if (screenMode) screen else camera
                    streamer.connect(video = video, audio = audio, token = streamToken)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: LivestreamException) {
                    notice = describeStreamer(failure.error)
                } catch (failure: Exception) {
                    notice = failure.message ?: "Could not start the livestream"
                } finally {
                    connecting = false
                }
            }
    }

    fun useCamera() {
        if (!screenMode) return
        connectJob?.cancel()
        notice = ""
        connecting = true
        connectJob =
            scope.launch {
                try {
                    screenMode = false
                    client.stopScreenShare()
                    screen = null
                    reconnect(camera)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: LivestreamException) {
                    notice = describeStreamer(failure.error)
                } catch (failure: Exception) {
                    notice = failure.message ?: "Could not switch to the camera"
                } finally {
                    connecting = false
                }
            }
    }

    fun useScreen() {
        if (screenMode) return
        connectJob?.cancel()
        notice = ""
        connecting = true
        connectJob =
            scope.launch {
                try {
                    ForegroundService.start(context, streamerServiceConfig)
                    val track = client.startScreenShare()
                    screen = track
                    screenMode = true
                    reconnect(track)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: LivestreamException) {
                    notice = describeStreamer(failure.error)
                } catch (failure: Exception) {
                    notice = failure.message ?: "Could not start screen sharing"
                } finally {
                    connecting = false
                }
            }
    }

    fun stop() {
        connectJob?.cancel()
        connectJob = null
        connecting = false
        streamer.disconnect()
        if (screenMode) {
            screenMode = false
            screen = null
            scope.launch { client.stopScreenShare() }
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = livestreamBackground) {
        Column(
            modifier =
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text =
                when {
                    connecting -> "Connecting..."
                    isConnected -> "Streaming"
                    else -> "Not streaming"
                },
                modifier = Modifier.testTag("streamer-status")
            )
            val message = notice.ifEmpty { error?.let(::describeStreamer).orEmpty() }
            if (message.isNotEmpty()) {
                Text(message, color = Color.Red, modifier = Modifier.testTag("streamer-error"))
            }
            OutlinedTextField(
                value = roomName,
                onValueChange = { roomName = it },
                label = { Text("Room name") },
                keyboardOptions = streamerPlainText,
                modifier = Modifier.fillMaxWidth().testTag("streamer-room")
            )
            Text("Not for production.", modifier = Modifier.testTag("streamer-sandbox-warning"))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (screenMode) {
                    OutlinedButton(
                        onClick = ::useCamera,
                        enabled = !connecting,
                        modifier = Modifier.weight(1f).testTag("streamer-camera")
                    ) { Text("Camera") }
                } else {
                    Button(
                        onClick = ::useCamera,
                        enabled = !connecting,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF001A72)),
                        modifier = Modifier.weight(1f).testTag("streamer-camera")
                    ) { Text("Camera") }
                }
                if (screenMode) {
                    Button(
                        onClick = ::useScreen,
                        enabled = !connecting,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF001A72)),
                        modifier = Modifier.weight(1f).testTag("streamer-screen")
                    ) { Text("Share screen") }
                } else {
                    OutlinedButton(
                        onClick = ::useScreen,
                        enabled = !connecting,
                        modifier = Modifier.weight(1f).testTag("streamer-screen")
                    ) { Text("Share screen") }
                }
            }
            if (isConnected) {
                OutlinedButton(onClick = ::stop, modifier = Modifier.testTag("streamer-stop")) {
                    Text("Stop Streaming")
                }
            } else {
                Button(
                    onClick = ::start,
                    enabled = (devicesReady || screen != null) && roomName.isNotBlank() && !connecting,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF001A72)),
                    modifier = Modifier.testTag("streamer-start")
                ) { Text(if (connecting) "Connecting..." else "Start Streaming") }
            }
            Box(
                modifier =
                Modifier
                    .fillMaxWidth()
                    .height(320.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                if (preview != null) {
                    VideoView(
                        track = preview,
                        modifier = Modifier.fillMaxSize().testTag("streamer-preview"),
                        mirror = !screenMode,
                        objectFit = if (screenMode) ObjectFit.Contain else ObjectFit.Cover
                    )
                } else {
                    Text(
                        when {
                            screenMode -> "Starting screen share..."
                            devicesReady -> "Camera ready"
                            else -> "Initializing camera..."
                        },
                        color = Color.White,
                        modifier = Modifier.testTag("streamer-no-video")
                    )
                }
            }
        }
    }
}

private fun describeStreamer(error: LivestreamError): String = when (error) {
    LivestreamError.Unauthorized -> "Unauthorized: the streamer token was rejected"
    LivestreamError.StreamNotFound -> "Stream not found"
    LivestreamError.StreamerAlreadyConnected -> "A streamer is already connected to this room"
    LivestreamError.UnknownError -> "Could not start the livestream"
}
