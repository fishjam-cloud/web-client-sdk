import AVFoundation
import AVKit
import UIKit
import WebRTC

public struct AudioDevice: Equatable {
    public let type: AudioDeviceType
    public let nativeType: String
    public let name: String
    public let id: String

    public init(type: AudioDeviceType, nativeType: String, name: String, id: String) {
        self.type = type
        self.nativeType = nativeType
        self.name = name
        self.id = id
    }
}

public enum AudioDeviceType: String, Equatable {
    case earpiece
    case speaker
    case bluetooth
    case wiredHeadset
    case usb
    case hdmi
    case airplay
    case carAudio
    case hearingAid
    case lineOut
    case unknown
}

public enum AudioOutputOverride {
    case speaker
    case none
}

public enum AudioOutputErrorCode: String, Equatable {
    case select
    case superseded
    case timeout
    case cancelled
    case invalid
    case `override`
}

public struct AudioOutputException: LocalizedError, Equatable {
    public let code: AudioOutputErrorCode
    public let message: String

    public var errorDescription: String? {
        message
    }
}

/// `true` when `next` is the first connected status, `false` when a connected
/// room ends, and `nil` when the mode stays as it is. Reconnect keeps
/// `.connected`, so this stays `nil` across retries.
func communicationModeChange(from previous: PeerStatus, to next: PeerStatus) -> Bool? {
    let wasConnected = previous == .connected
    let nowConnected = next == .connected
    return wasConnected == nowConnected ? nil : nowConnected
}

private let audioDeviceTypes: [AVAudioSession.Port: AudioDeviceType] = [
    .builtInReceiver: .earpiece,
    .builtInSpeaker: .speaker,
    .bluetoothHFP: .bluetooth,
    .bluetoothA2DP: .bluetooth,
    .bluetoothLE: .bluetooth,
    .headphones: .wiredHeadset,
    .headsetMic: .wiredHeadset,
    .usbAudio: .usb,
    .HDMI: .hdmi,
    .airPlay: .airplay,
    .carAudio: .carAudio,
    .lineOut: .lineOut
]

private let audioDeviceNativeTypes: [AVAudioSession.Port: String] = [
    .builtInMic: "builtInMic",
    .headsetMic: "headsetMic",
    .lineIn: "lineIn",
    .lineOut: "lineOut",
    .headphones: "headphones",
    .bluetoothA2DP: "bluetoothA2DP",
    .builtInReceiver: "builtInReceiver",
    .builtInSpeaker: "builtInSpeaker",
    .HDMI: "HDMI",
    .airPlay: "airPlay",
    .bluetoothLE: "bluetoothLE",
    .bluetoothHFP: "bluetoothHFP",
    .usbAudio: "usbAudio",
    .carAudio: "carAudio"
]

func audioDeviceType(for port: AVAudioSession.Port) -> AudioDeviceType {
    audioDeviceTypes[port] ?? .unknown
}

func audioDeviceNativeType(for port: AVAudioSession.Port) -> String {
    audioDeviceNativeTypes[port] ?? port.rawValue
}

func audioDeviceId(port: AVAudioSession.Port, uid: String) -> String {
    switch port {
    case .builtInSpeaker:
        return "speaker"
    case .builtInReceiver:
        return "receiver"
    default:
        return uid
    }
}

/// Lists, reads and switches the iOS audio route. Port of the Flutter SDK's
/// audio output manager. Route changes are delivered through [onChange].
final class AudioOutputManager {
    var onChange: ((AudioDevice?, [AudioDevice]) -> Void)?

    private var routeObserver: NSObjectProtocol?
    private var releaseGeneration = 0

    deinit {
        stopObserving()
    }

    func snapshot() -> (current: AudioDevice?, available: [AudioDevice]) {
        (currentDevice(), availableDevices())
    }

    func startObserving() {
        guard routeObserver == nil else { return }
        routeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.publish()
        }
    }

    func stopObserving() {
        if let observer = routeObserver {
            NotificationCenter.default.removeObserver(observer)
            routeObserver = nil
        }
    }

    func showAudioRoutePicker() {
        let present = {
            let picker = AVRoutePickerView(frame: .zero)
            let keyWindow = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow)
            keyWindow?.addSubview(picker)
            // AVRoutePickerView has no API to open itself; tapping its button does.
            picker.subviews
                .compactMap { $0 as? UIButton }
                .first?
                .sendActions(for: .touchUpInside)
            picker.removeFromSuperview()
        }
        if Thread.isMainThread {
            present()
        } else {
            DispatchQueue.main.async(execute: present)
        }
    }

    func overrideAudioOutput(_ output: AudioOutputOverride) throws {
        let port: AVAudioSession.PortOverride = output == .speaker ? .speaker : .none
        let session = RTCAudioSession.sharedInstance()
        session.lockForConfiguration()
        defer { session.unlockForConfiguration() }
        do {
            try session.overrideOutputAudioPort(port)
        } catch {
            throw AudioOutputException(code: .override, message: error.localizedDescription)
        }
    }

    /// Drops a release scheduled by [exitCommunicationMode]. The media session
    /// activates call audio; this method does not.
    func enterCommunicationMode() {
        releaseGeneration += 1
    }

    /// Deactivates the call session and tells other apps they can resume.
    /// Retried while capture is still running.
    func exitCommunicationMode() {
        releaseGeneration += 1
        releaseOtherApps(generation: releaseGeneration, attempt: 0)
    }

    /// `setActive(false)` without `notifyOthersOnDeactivation` leaves a paused
    /// app paused. When this session is no longer silencing other apps, activate
    /// it once so the resume signal is attached to a real transition back to inactive.
    private func releaseOtherApps(generation: Int, attempt: Int) {
        guard generation == releaseGeneration else { return }
        let session = AVAudioSession.sharedInstance()
        guard Self.isCallCategory(session.category) else { return }

        if !session.secondaryAudioShouldBeSilencedHint {
            do {
                try session.setActive(true)
            } catch {
                NSLog("FishjamClient: audio session not activated for release: %@", error.localizedDescription)
                scheduleReleaseRetry(generation: generation, attempt: attempt)
                return
            }
        }

        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            NSLog("FishjamClient: audio session not released: %@", error.localizedDescription)
            scheduleReleaseRetry(generation: generation, attempt: attempt)
        }
    }

    private func scheduleReleaseRetry(generation: Int, attempt: Int) {
        guard attempt < Self.releaseRetryDelays.count else { return }
        let delay = Self.releaseRetryDelays[attempt]
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.releaseOtherApps(generation: generation, attempt: attempt + 1)
        }
    }

    private func publish() {
        onChange?(currentDevice(), availableDevices())
    }

    private func availableDevices() -> [AudioDevice] {
        var devices = [Self.builtInSpeaker, Self.builtInReceiver]
        let inputs = AVAudioSession.sharedInstance().availableInputs ?? []
        for port in inputs where port.portType != .builtInMic {
            devices.append(audioDevice(from: port))
        }
        return devices
    }

    private func currentDevice() -> AudioDevice? {
        guard let port = AVAudioSession.sharedInstance().currentRoute.outputs.first else {
            return nil
        }
        return audioDevice(from: port)
    }

    private func audioDevice(from port: AVAudioSessionPortDescription) -> AudioDevice {
        AudioDevice(
            type: audioDeviceType(for: port.portType),
            nativeType: audioDeviceNativeType(for: port.portType),
            name: port.portName,
            id: audioDeviceId(port: port.portType, uid: port.uid)
        )
    }

    private static func isCallCategory(_ category: AVAudioSession.Category) -> Bool {
        category == .playAndRecord || category == .record || category == .multiRoute
    }

    private static let releaseRetryDelays: [TimeInterval] = [0.2, 0.6, 1.2]

    private static let builtInSpeaker = AudioDevice(
        type: .speaker,
        nativeType: "builtInSpeaker",
        name: "Speaker",
        id: "speaker"
    )

    private static let builtInReceiver = AudioDevice(
        type: .earpiece,
        nativeType: "builtInReceiver",
        name: "iPhone",
        id: "receiver"
    )
}
