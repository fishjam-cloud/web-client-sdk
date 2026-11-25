import Foundation

extension FishjamClient {
    /// Opens the screen share socket and presents the system broadcast picker.
    /// Returns the screen-share video track. Frames arrive after the broadcast starts.
    /// Returns the running track when screen sharing is already on.
    /// Publishing starts when the first frame arrives from the Broadcast Upload Extension.
    @discardableResult
    public func startScreenShare(presentPicker: Bool = true) async throws -> VideoTrack {
        try await screenShare.start(presentPicker: presentPicker)
    }

    public func stopScreenShare() async throws {
        try await screenShare.stop()
    }

    public func toggleScreenShare() async throws {
        try await screenShare.toggle()
    }
}
