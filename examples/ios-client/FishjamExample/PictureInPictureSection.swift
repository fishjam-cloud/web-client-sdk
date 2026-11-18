import FishjamClient
import SwiftUI

extension PictureInPictureController {
    /// The example keeps the camera capturing in PiP because Info.plist lists the voip background mode.
    /// iOS 16 and 17 also need the multitasking camera access entitlement, which Apple grants on request.
    static func example(client: FishjamClient) -> PictureInPictureController {
        PictureInPictureController(client: client, options: PipOptions(allowsCameraInBackground: true))
    }
}

/// Starts and stops PiP. PiP also starts when the app goes to the background.
struct PictureInPictureButton: View {
    @ObservedObject var pip: PictureInPictureController
    let disabled: Bool

    var body: some View {
        Button(pip.isActive ? "Stop PiP" : "Start PiP") {
            if pip.isActive { pip.stopPIP() } else { pip.startPIP() }
        }
        .buttonStyle(.borderedProminent)
        .disabled(disabled)
        .accessibilityIdentifier("pip")
    }
}
