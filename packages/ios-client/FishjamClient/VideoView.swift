import SwiftUI
import WebRTC

public enum ObjectFit {
    case contain
    case cover
}

public struct VideoView: View {
    private let track: VideoTrack
    private let mirror: Bool
    private let objectFit: ObjectFit

    public init(track: VideoTrack, mirror: Bool = false, objectFit: ObjectFit = .cover) {
        self.track = track
        self.mirror = mirror
        self.objectFit = objectFit
    }

    public var body: some View {
        VideoRenderer(track: track, mirror: mirror, objectFit: objectFit)
    }
}

private struct VideoRenderer: UIViewRepresentable {
    let track: VideoTrack
    let mirror: Bool
    let objectFit: ObjectFit

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.clipsToBounds = true
        apply(to: view)
        track.add(view)
        context.coordinator.track = track
        return view
    }

    func updateUIView(_ view: RTCMTLVideoView, context: Context) {
        apply(to: view)
        guard context.coordinator.track !== track else { return }
        context.coordinator.track?.remove(view)
        track.add(view)
        context.coordinator.track = track
    }

    static func dismantleUIView(_ view: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.track?.remove(view)
        coordinator.track = nil
    }

    private func apply(to view: RTCMTLVideoView) {
        view.videoContentMode = objectFit == .contain ? .scaleAspectFit : .scaleAspectFill
        view.transform = mirror ? CGAffineTransform(scaleX: -1, y: 1) : .identity
    }

    final class Coordinator {
        var track: VideoTrack?
    }
}
