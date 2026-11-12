import Foundation

/// Thrown when a video track is added in an audio-only room.
public struct TrackTypeError: Error, LocalizedError, Equatable, Sendable {
    public init() {}

    public var errorDescription: String? {
        "Attempted to add video track to audio-only room. "
            + "Please refer to the docs at https://docs.fishjam.io/audio-calls"
    }
}

/// What `FishjamClient.startCamera` does once the room type is known.
enum CameraStart: Equatable {
    /// Open the camera, then publish when the peer is connected.
    case openAndPublish
    /// The peer is connected to an audio-only room. Do not open the camera.
    case rejectVideo
}

func cameraStart(connected: Bool, audioOnly: Bool) -> CameraStart {
    if connected && audioOnly {
        return .rejectVideo
    }
    return .openAndPublish
}

func isTrackTypeError(_ error: Fishjam_Sdk_Error) -> Bool {
    error.callErrorReason == .trackType
}
