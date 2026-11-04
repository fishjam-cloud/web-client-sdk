package io.fishjam.client

import fishjam.sdk.SdkApi
import kotlin.math.max

/**
 * Configures the core's automatic reconnection (see `fishjam-core`'s
 * `reconnect.rs`). Reconnection is on by default; pass `enabled = false` to
 * turn it off.
 *
 * The defaults below match the core's own defaults (`ReconnectConfig`'s
 * `default_enabled()`); they are repeated here only so this type has a
 * constructor that doesn't require passing every field.
 */
data class ReconnectConfig(
    /** Turn automatic reconnection on or off entirely. */
    val enabled: Boolean = true,
    /**
     * How many attempts to make on one network before waiting for the
     * network to change. Resets when the device's network changes.
     */
    val maxAttempts: Int = 3,
    /** Delay before the first retry attempt, in milliseconds. */
    val initialDelayMs: Long = 500,
    /**
     * Added delay per further attempt, in milliseconds: attempt N waits
     * `initialDelayMs + delayMs * (N - 1)`.
     */
    val delayMs: Long = 500,
    /**
     * Whether to re-publish local tracks that were live right before the
     * disconnect, once rejoined. Matches the RN/Flutter SDKs' default.
     */
    val addTracksOnReconnect: Boolean = true,
    /**
     * If the device has no network at all for this long while trying to
     * reconnect, give up instead of waiting indefinitely. In milliseconds.
     */
    val offlineTimeoutMs: Long = 60_000
) {
    internal fun toProto(): SdkApi.ReconnectConfig = SdkApi.ReconnectConfig
        .newBuilder()
        .setEnabled(enabled)
        .setMaxAttempts(max(0, maxAttempts))
        .setInitialDelayMs(max(0, initialDelayMs).toInt())
        .setDelayMs(max(0, delayMs).toInt())
        .setAddTracksOnReconnect(addTracksOnReconnect)
        .setOfflineTimeoutMs(max(0, offlineTimeoutMs).toInt())
        .build()
}
