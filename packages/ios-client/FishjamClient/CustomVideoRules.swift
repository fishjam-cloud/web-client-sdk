import Foundation
import WebRTC

struct CustomVideoError: Error, Equatable {
    let message: String
}

/// 0, 90, 180, or 270. Any other value becomes 0.
func customVideoRotation(_ degrees: Int) -> RTCVideoRotation {
    switch degrees {
    case 90:
        return ._90
    case 180:
        return ._180
    case 270:
        return ._270
    default:
        return ._0
    }
}

func requireCustomVideoPoolSize(width: Int, height: Int, poolSize: Int) throws {
    if width <= 0 || height <= 0 || poolSize <= 0 {
        throw CustomVideoError(message: "width, height and poolSize must all be positive")
    }
}

/// One pool attaches to one live track. `dispose` throws while that track has not stopped.
final class CustomVideoPoolGate {
    private var disposed = false
    private var liveTrack = false

    func attach() throws {
        if disposed {
            throw CustomVideoError(message: "This pool is disposed")
        }
        if liveTrack {
            throw CustomVideoError(message: "This pool is already attached to a track")
        }
        liveTrack = true
    }

    func trackStopped() {
        liveTrack = false
    }

    /// Returns false when the pool was already disposed.
    func dispose() throws -> Bool {
        if disposed {
            return false
        }
        if liveTrack {
            throw CustomVideoError(message: "Stop the track that uses this pool before disposing it")
        }
        disposed = true
        return true
    }
}
