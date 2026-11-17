import Foundation

/// Speech when the microphone level is above -32 dBov, the server's threshold.
/// The level is linear, from 0 to 1: 10^(-32/20).
struct SpeakingDetector {
    static let speechThreshold = pow(10.0, -32.0 / 20.0)
    static let silenceDebounceTicks = 2

    private var speaking = false
    private var silenceTicks = 0

    mutating func reset() {
        speaking = false
        silenceTicks = 0
    }

    /// One poll. A missing level counts as quiet. Silence waits for two quiet polls.
    mutating func onLevel(_ level: Double?) -> VadStatus {
        if let level, level > Self.speechThreshold {
            silenceTicks = 0
            speaking = true
        } else {
            silenceTicks += 1
            if silenceTicks >= Self.silenceDebounceTicks {
                speaking = false
            }
        }
        return speaking ? .speech : .silence
    }
}
