package io.fishjam.example

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import io.fishjam.client.FishjamClient
import io.fishjam.client.FishjamEvent

private const val MAX_LOG_LINES = 30
private const val SHORT_ID_LENGTH = 8

/** Shows the newest [MAX_LOG_LINES] events of [client], newest first. */
@Composable
fun EventLogPanel(client: FishjamClient) {
    val lines = remember { mutableStateListOf<String>() }
    LaunchedEffect(client) {
        client.events.collect { event ->
            lines.add(0, describeEvent(event))
            while (lines.size > MAX_LOG_LINES) lines.removeAt(lines.size - 1)
        }
    }
    Column(
        modifier =
        Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(4.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Events (${lines.size})", style = MaterialTheme.typography.titleSmall)
            OutlinedButton(onClick = { lines.clear() }, modifier = Modifier.testTag("clear-events")) {
                Text("Clear")
            }
        }
        Column(modifier = Modifier.testTag("event-log")) {
            lines.forEach { line ->
                Text(line, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun shortId(id: String): String = id.take(SHORT_ID_LENGTH)

/** One line per event: its name plus the ids that matter. */
internal fun describeEvent(event: FishjamEvent): String = when (event) {
    FishjamEvent.ConnectionStarted -> "connectionStarted"
    is FishjamEvent.AuthSuccess -> "authSuccess audioOnly=${event.audioOnly}"
    is FishjamEvent.AuthError -> "authError ${event.reason}"
    is FishjamEvent.Joined -> "joined peer=${shortId(event.peerId)} peers=${event.peers.size}"
    is FishjamEvent.JoinError -> "joinError ${event.reason}"
    is FishjamEvent.ConnectionError -> "connectionError ${event.message}"
    FishjamEvent.Disconnected -> "disconnected"
    FishjamEvent.ReconnectionStarted -> "reconnectionStarted"
    FishjamEvent.Reconnected -> "reconnected"
    FishjamEvent.ReconnectionRetriesLimitReached -> "reconnectionRetriesLimitReached"
    is FishjamEvent.PeerJoined -> "peerJoined remote=${shortId(event.peer.id)} tracks=${event.peer.tracks.size}"
    is FishjamEvent.PeerLeft -> "peerLeft remote=${shortId(event.peer.id)}"
    is FishjamEvent.PeerUpdated -> "peerUpdated remote=${shortId(event.peer.id)}"
    is FishjamEvent.TrackAdded -> "trackAdded remote=${shortId(event.peerId)} ${trackLabel(event.track)}"
    is FishjamEvent.TrackReady -> "trackReady remote=${shortId(event.peerId)} ${trackLabel(event.track)}"
    is FishjamEvent.TrackRemoved -> "trackRemoved remote=${shortId(event.peerId)} ${trackLabel(event.track)}"
    is FishjamEvent.TrackUpdated -> "trackUpdated remote=${shortId(event.peerId)} ${trackLabel(event.track)}"
    is FishjamEvent.LocalTrackAdded -> "localTrackAdded ${event.type} ${shortId(event.trackId)}"
    is FishjamEvent.LocalTrackRemoved -> "localTrackRemoved ${shortId(event.trackId)}"
    is FishjamEvent.LocalTrackReplaced -> "localTrackReplaced ${shortId(event.trackId)}"
    is FishjamEvent.LocalTrackBandwidthSet -> "localTrackBandwidthSet ${shortId(event.trackId)}"
    is FishjamEvent.LocalTrackEncodingBandwidthSet ->
        "localTrackEncodingBandwidthSet ${shortId(event.trackId)} ${event.variant} ${event.kbps}kbps"
    is FishjamEvent.LocalPeerMetadataChanged -> "localPeerMetadataChanged"
}

private fun trackLabel(track: io.fishjam.client.Track): String =
    "${track.metadata?.type.orEmpty()} ${shortId(track.trackId)}"
