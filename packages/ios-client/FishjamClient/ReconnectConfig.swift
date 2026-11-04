import Foundation

/// Configures the core's automatic reconnection (see `fishjam-core`'s
/// `reconnect.rs`). Reconnection is on by default; pass `enabled: false` to
/// turn it off.
///
/// The defaults below match the core's own defaults (`ReconnectConfig`'s
/// `default_enabled()`); they are repeated here only so this type has a
/// memberwise `init` that doesn't require passing every field.
public struct ReconnectConfig: Sendable {
    /// Turn automatic reconnection on or off entirely.
    public var enabled: Bool
    /// How many attempts to make on one network before waiting for the
    /// network to change. Resets when the device's network changes.
    public var maxAttempts: UInt32
    /// Delay before the first retry attempt.
    public var initialDelay: TimeInterval
    /// Added delay per further attempt: attempt N waits
    /// `initialDelay + delay * (N - 1)`.
    public var delay: TimeInterval
    /// Whether to re-publish local tracks that were live right before the
    /// disconnect, once rejoined. Matches the RN/Flutter SDKs' default.
    public var addTracksOnReconnect: Bool
    /// If the device has no network at all for this long while trying to
    /// reconnect, give up instead of waiting indefinitely.
    public var offlineTimeout: TimeInterval

    public init(
        enabled: Bool = true,
        maxAttempts: UInt32 = 3,
        initialDelay: TimeInterval = 0.5,
        delay: TimeInterval = 0.5,
        addTracksOnReconnect: Bool = true,
        offlineTimeout: TimeInterval = 60
    ) {
        self.enabled = enabled
        self.maxAttempts = maxAttempts
        self.initialDelay = initialDelay
        self.delay = delay
        self.addTracksOnReconnect = addTracksOnReconnect
        self.offlineTimeout = offlineTimeout
    }

    func toProto() -> Fishjam_Sdk_ReconnectConfig {
        Fishjam_Sdk_ReconnectConfig.with {
            $0.enabled = enabled
            $0.maxAttempts = maxAttempts
            $0.initialDelayMs = UInt32(max(0, initialDelay * 1000).rounded())
            $0.delayMs = UInt32(max(0, delay * 1000).rounded())
            $0.addTracksOnReconnect = addTracksOnReconnect
            $0.offlineTimeoutMs = UInt32(max(0, offlineTimeout * 1000).rounded())
        }
    }
}
