import AVKit
import Combine
import SwiftUI
import UIKit

public struct PipOptions {
    public var enabled: Bool
    /// Start PiP when the app goes to the background.
    public var startAutomatically: Bool
    /// Stop PiP when the app returns to the foreground.
    public var stopAutomatically: Bool
    /// Keep the camera capturing while in PiP. iOS 16 and above, with `voip` in `UIBackgroundModes`.
    /// iOS 16 and 17 also need the `com.apple.developer.avfoundation.multitasking-camera-access` entitlement.
    public var allowsCameraInBackground: Bool
    public var placeholderText: String
    /// The tiles of the PiP window, left to right.
    public var tiles: [PipTile]

    public init(
        enabled: Bool = true,
        startAutomatically: Bool = true,
        stopAutomatically: Bool = true,
        allowsCameraInBackground: Bool = false,
        placeholderText: String = "No video",
        tiles: [PipTile] = [.localCamera, .activeSpeaker]
    ) {
        self.enabled = enabled
        self.startAutomatically = startAutomatically
        self.stopAutomatically = stopAutomatically
        self.allowsCameraInBackground = allowsCameraInBackground
        self.placeholderText = placeholderText
        self.tiles = tiles
    }
}

/// What a `PipTile` can choose its video from.
public struct PipContext {
    public let room: RoomState
    public let voiceActivity: [String: Bool]
    /// The remote peer speaking now, else the last speaker, else the first remote peer with camera video.
    public let activeSpeaker: PeerWithTracks?
}

/// One tile of the PiP window. `track` picks its video, and `nil` shows the placeholder text.
public struct PipTile {
    public let mirror: Bool
    public let track: (PipContext) -> VideoTrack?

    public init(mirror: Bool = false, track: @escaping (PipContext) -> VideoTrack?) {
        self.mirror = mirror
        self.track = track
    }

    public static let localCamera = PipTile(mirror: true) { $0.room.localPeer?.cameraTrack?.videoTrack }
    public static let localScreenShare = PipTile { $0.room.localPeer?.screenShareVideoTrack?.videoTrack }
    public static let activeSpeaker = PipTile { $0.activeSpeaker?.cameraTrack?.videoTrack }
    public static let activeSpeakerScreenShare = PipTile { $0.activeSpeaker?.screenShareVideoTrack?.videoTrack }

    public static func peerCamera(_ peerId: String) -> PipTile {
        PipTile { context in
            context.room.remotePeers.first { $0.id == peerId }?.cameraTrack?.videoTrack
        }
    }
}

/// The remote peer shown on the right of the PiP window: the one speaking now, else the last
/// speaker still in the room, else the first remote peer with camera video.
func pickActiveSpeaker(
    remotePeers: [PeerWithTracks],
    voiceActivity: [String: Bool],
    lastSpeakerId: String?
) -> PeerWithTracks? {
    if let speaking = remotePeers.first(where: { voiceActivity[$0.id] == true }) {
        return speaking
    }
    if let lastSpeakerId, let last = remotePeers.first(where: { $0.id == lastSpeakerId }) {
        return last
    }
    return remotePeers.first { $0.cameraTrack?.videoTrack != nil }
}

/// Picture in Picture for calls. By default the PiP window shows the local camera on the left and the
/// active speaker on the right. Change that with `PipOptions.tiles`. The app looks the same until PiP starts.
/// PiP starts from a view that has `.pictureInPictureSource(controller)`, which must be on screen.
/// Add `audio` to `UIBackgroundModes` so PiP keeps showing video in the background.
public final class PictureInPictureController: NSObject, ObservableObject {
    @Published public private(set) var isActive = false
    public let options: PipOptions

    private weak var client: FishjamClient?
    private var lastSpeakerId: String?
    private var subscriptions: [AnyCancellable] = []
    private var foregroundObserver: NSObjectProtocol?
    private let content: PipSplitView
    private let callViewController = AVPictureInPictureVideoCallViewController()
    private var pipController: AVPictureInPictureController?
    private weak var sourceView: UIView?

    public init(client: FishjamClient, options: PipOptions = PipOptions()) {
        self.client = client
        self.options = options
        content = PipSplitView(tiles: options.tiles, placeholderText: options.placeholderText)
        super.init()
        content.translatesAutoresizingMaskIntoConstraints = false
        callViewController.view.addSubview(content)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: callViewController.view.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: callViewController.view.trailingAnchor),
            content.topAnchor.constraint(equalTo: callViewController.view.topAnchor),
            content.bottomAnchor.constraint(equalTo: callViewController.view.bottomAnchor)
        ])
        callViewController.preferredContentSize = CGSize(width: 1280, height: 720)

        client.$roomState.combineLatest(client.$voiceActivity)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] room, speaking in self?.update(room: room, speaking: speaking) }
            .store(in: &subscriptions)
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self, self.options.stopAutomatically else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.stopPIP() }
        }
        client.setPictureInPictureCameraAccess(options.enabled && options.allowsCameraInBackground)
    }

    deinit {
        if let foregroundObserver { NotificationCenter.default.removeObserver(foregroundObserver) }
        content.setTracks(options.tiles.map { _ in nil })
        client?.setPictureInPictureCameraAccess(false)
    }

    public func startPIP() {
        guard let pipController, pipController.isPictureInPicturePossible else { return }
        pipController.startPictureInPicture()
    }

    public func stopPIP() {
        guard let pipController, pipController.isPictureInPictureActive else { return }
        pipController.stopPictureInPicture()
    }

    func attach(sourceView view: UIView) {
        guard options.enabled, AVPictureInPictureController.isPictureInPictureSupported(), sourceView !== view else {
            return
        }
        sourceView = view
        let source = AVPictureInPictureController.ContentSource(
            activeVideoCallSourceView: view, contentViewController: callViewController
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.canStartPictureInPictureAutomaticallyFromInline = options.startAutomatically
        controller.delegate = self
        pipController = controller
    }

    func detach(sourceView view: UIView) {
        guard sourceView === view else { return }
        stopPIP()
        sourceView = nil
        pipController = nil
    }

    private func update(room: RoomState, speaking: [String: Bool]) {
        let speaker = pickActiveSpeaker(
            remotePeers: room.remotePeers, voiceActivity: speaking, lastSpeakerId: lastSpeakerId
        )
        if let speaker, speaking[speaker.id] == true { lastSpeakerId = speaker.id }
        let context = PipContext(room: room, voiceActivity: speaking, activeSpeaker: speaker)
        content.setTracks(options.tiles.map { $0.track(context) })
    }
}

extension PictureInPictureController: AVPictureInPictureControllerDelegate {
    public func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
        content.shouldRender = true
        client?.setPictureInPictureCameraAccess(options.allowsCameraInBackground)
    }

    public func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        isActive = true
    }

    public func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        content.shouldRender = false
        NSLog("Fishjam PiP failed to start: %@", error.localizedDescription)
    }

    public func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        content.shouldRender = false
        isActive = false
    }

    public func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(true)
    }
}

/// The content of the PiP window: the tiles side by side.
private final class PipSplitView: UIView {
    private let tiles: [PipTileView]

    var shouldRender = false {
        didSet { tiles.forEach { $0.video.shouldRender = shouldRender } }
    }

    init(tiles: [PipTile], placeholderText: String) {
        self.tiles = tiles.map { PipTileView(mirror: $0.mirror, placeholderText: placeholderText) }
        super.init(frame: .zero)
        backgroundColor = .black
        let stack = UIStackView(arrangedSubviews: self.tiles)
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        pin(stack, to: self)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    func setTracks(_ tracks: [VideoTrack?]) {
        for (index, tile) in tiles.enumerated() {
            tile.setTrack(index < tracks.count ? tracks[index] : nil)
        }
    }
}

private final class PipTileView: UIView {
    let video = SampleBufferVideoView()
    let placeholder = UILabel()
    private let videoContainer = UIView()
    private var track: VideoTrack?

    init(mirror: Bool, placeholderText: String) {
        super.init(frame: .zero)
        placeholder.text = placeholderText
        backgroundColor = .black
        clipsToBounds = true
        videoContainer.translatesAutoresizingMaskIntoConstraints = false
        video.translatesAutoresizingMaskIntoConstraints = false
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        placeholder.textColor = .white
        placeholder.font = .preferredFont(forTextStyle: .caption1)
        placeholder.textAlignment = .center
        addSubview(videoContainer)
        videoContainer.addSubview(video)
        addSubview(placeholder)
        pin(videoContainer, to: self)
        pin(video, to: videoContainer)
        NSLayoutConstraint.activate([
            placeholder.centerXAnchor.constraint(equalTo: centerXAnchor),
            placeholder.centerYAnchor.constraint(equalTo: centerYAnchor)
        ])
        // The video layer's own transform holds the frame rotation, so mirroring goes on the container.
        if mirror { videoContainer.transform = CGAffineTransform(scaleX: -1, y: 1) }
        setTrack(nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    deinit {
        track?.remove(video)
    }

    func setTrack(_ newTrack: VideoTrack?) {
        if track === newTrack, track != nil { return }
        track?.remove(video)
        track = newTrack
        newTrack?.add(video)
        videoContainer.isHidden = newTrack == nil
        placeholder.isHidden = newTrack != nil
    }
}

private func pin(_ view: UIView, to container: UIView) {
    NSLayoutConstraint.activate([
        view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
        view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
        view.topAnchor.constraint(equalTo: container.topAnchor),
        view.bottomAnchor.constraint(equalTo: container.bottomAnchor)
    ])
}

extension View {
    /// Makes this view the one PiP animates from, like `pip` on the local tile in React Native.
    /// Put it on a view that stays on screen during the call, such as the local camera tile.
    public func pictureInPictureSource(_ controller: PictureInPictureController?) -> some View {
        background(PipSourceView(controller: controller))
    }
}

private struct PipSourceView: UIViewRepresentable {
    let controller: PictureInPictureController?

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        controller?.attach(sourceView: view)
        context.coordinator.controller = controller
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        guard context.coordinator.controller !== controller else { return }
        context.coordinator.controller?.detach(sourceView: view)
        controller?.attach(sourceView: view)
        context.coordinator.controller = controller
    }

    static func dismantleUIView(_ view: UIView, coordinator: Coordinator) {
        coordinator.controller?.detach(sourceView: view)
        coordinator.controller = nil
    }

    final class Coordinator {
        weak var controller: PictureInPictureController?
    }
}
