package io.fishjam.example

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import io.fishjam.client.ConnectViewerConfig
import io.fishjam.client.LivestreamError
import io.fishjam.client.LivestreamException
import io.fishjam.client.LivestreamViewer
import io.fishjam.client.ObjectFit
import io.fishjam.client.SandboxApi
import io.fishjam.client.VideoView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

private val plainText = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false)
private val livestreamBlue = Color(0xFF001A72)
internal val livestreamBackground = Color(0xFFBFE7F8)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LivestreamViewerScreen() {
    val context = LocalContext.current
    val viewer = remember { LivestreamViewer(context, BuildConfig.FISHJAM_ID) }
    DisposableEffect(viewer) { onDispose { viewer.close() } }
    val scope = rememberCoroutineScope()
    val videoTrack by viewer.videoTrack.collectAsState()
    val isConnected by viewer.isConnected.collectAsState()
    val error by viewer.error.collectAsState()
    var roomName by rememberSaveable { mutableStateOf("testtest") }
    var streamId by rememberSaveable { mutableStateOf("") }
    var notice by rememberSaveable { mutableStateOf("") }
    var connecting by remember { mutableStateOf(false) }
    var connectJob by remember { mutableStateOf<Job?>(null) }

    fun start(work: suspend () -> Unit) {
        connectJob?.cancel()
        notice = ""
        connecting = true
        connectJob =
            scope.launch {
                try {
                    work()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: LivestreamException) {
                    notice = describe(failure.error)
                } catch (failure: Exception) {
                    notice = failure.message ?: "Could not play the livestream"
                } finally {
                    connecting = false
                }
            }
    }

    fun disconnect() {
        connectJob?.cancel()
        connectJob = null
        connecting = false
        viewer.disconnect()
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
                    isConnected -> "Connected"
                    else -> "Disconnected"
                },
                modifier = Modifier.testTag("livestream-status")
            )
            val message = notice.ifEmpty { error?.let(::describe).orEmpty() }
            if (message.isNotEmpty()) {
                Text(message, color = Color.Red, modifier = Modifier.testTag("livestream-error"))
            }
            OutlinedTextField(
                value = roomName,
                onValueChange = { roomName = it },
                label = { Text("Room name (viewer token)") },
                keyboardOptions = plainText,
                modifier = Modifier.fillMaxWidth().testTag("livestream-room")
            )
            OutlinedTextField(
                value = streamId,
                onValueChange = { streamId = it },
                label = { Text("Stream id (public stream)") },
                keyboardOptions = plainText,
                modifier = Modifier.fillMaxWidth().testTag("livestream-stream-id")
            )
            Text("Not for production.", modifier = Modifier.testTag("livestream-sandbox-warning"))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        start {
                            val token =
                                SandboxApi(BuildConfig.FISHJAM_SDK_API_URL)
                                    .getSandboxViewerToken(roomName.trim())
                            viewer.connect(ConnectViewerConfig.Token(token))
                        }
                    },
                    enabled = roomName.isNotBlank() && !connecting,
                    colors = ButtonDefaults.buttonColors(containerColor = livestreamBlue),
                    modifier = Modifier.testTag("livestream-connect-token")
                ) { Text("Connect to Livestream") }
                Button(
                    onClick = { start { viewer.connect(ConnectViewerConfig.StreamId(streamId.trim())) } },
                    enabled = streamId.isNotBlank() && !connecting,
                    colors = ButtonDefaults.buttonColors(containerColor = livestreamBlue),
                    modifier = Modifier.testTag("livestream-connect-public")
                ) { Text("Connect public") }
                OutlinedButton(
                    onClick = ::disconnect,
                    modifier = Modifier.testTag("livestream-disconnect")
                ) { Text("Disconnect") }
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
                val track = videoTrack
                if (track != null) {
                    VideoView(track = track, modifier = Modifier.fillMaxSize(), objectFit = ObjectFit.Contain)
                } else {
                    Text(if (connecting) "Connecting..." else "No video", color = Color.White)
                }
            }
        }
    }
}

private fun describe(error: LivestreamError): String = when (error) {
    LivestreamError.Unauthorized -> "Unauthorized: the viewer token was rejected"
    LivestreamError.StreamNotFound -> "Stream not found"
    LivestreamError.UnknownError -> "Could not play the livestream"
}
