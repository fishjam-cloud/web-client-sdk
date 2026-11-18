import Foundation

extension FishjamClient {
    /// Opens the screen share socket and presents the system broadcast picker.
    /// Publishing starts when the first frame arrives from the Broadcast Upload Extension.
    public func startScreenShare(presentPicker: Bool = true) async throws {
        try await screenShare.start(presentPicker: presentPicker)
    }

    public func stopScreenShare() async throws {
        try await screenShare.stop()
    }

    public func toggleScreenShare() async throws {
        try await screenShare.toggle()
    }
}
