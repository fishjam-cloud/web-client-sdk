import ReplayKit
import SwiftUI
import UIKit

/// Presents the system broadcast picker for the screen sharing extension.
///
/// Prefer this (or [presentBroadcastPicker]) to stop an active broadcast: tapping
/// while sharing opens the system Stop sheet. Closing the host socket instead
/// makes the extension show an error dialog.
@available(iOS 12.0, *)
public final class ScreenCapturePickerView: UIView {
    private let picker = RPSystemBroadcastPickerView()

    public var preferredExtension: String? {
        get { picker.preferredExtension }
        set { picker.preferredExtension = newValue }
    }

    public override init(frame: CGRect) {
        super.init(frame: frame)
        configure()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        picker.showsMicrophoneButton = false
        picker.translatesAutoresizingMaskIntoConstraints = false
        addSubview(picker)
        NSLayoutConstraint.activate([
            picker.leadingAnchor.constraint(equalTo: leadingAnchor),
            picker.trailingAnchor.constraint(equalTo: trailingAnchor),
            picker.topAnchor.constraint(equalTo: topAnchor),
            picker.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
        if preferredExtension == nil {
            preferredExtension = Bundle.main.infoDictionary?["RTCScreenSharingExtension"] as? String
        }
    }

    /// Taps the picker button, opening Start Broadcast or Stop Broadcast.
    @discardableResult
    public func show() -> Bool {
        presentBroadcastPicker(on: picker)
    }
}

/// SwiftUI wrapper around [ScreenCapturePickerView].
@available(iOS 13.0, *)
public struct ScreenCapturePicker: UIViewRepresentable {
    public var preferredExtension: String?

    public init(preferredExtension: String? = nil) {
        self.preferredExtension = preferredExtension
    }

    public func makeUIView(context: Context) -> ScreenCapturePickerView {
        let view = ScreenCapturePickerView()
        view.preferredExtension = preferredExtension
            ?? Bundle.main.infoDictionary?["RTCScreenSharingExtension"] as? String
        return view
    }

    public func updateUIView(_ uiView: ScreenCapturePickerView, context: Context) {
        if let preferredExtension {
            uiView.preferredExtension = preferredExtension
        }
    }
}

/// Opens the system broadcast picker for [extensionBundleId], or the Info.plist
/// key `RTCScreenSharingExtension` when [extensionBundleId] is nil.
@MainActor
@discardableResult
public func presentBroadcastPicker(extensionBundleId: String? = nil) -> Bool {
    let preferred = extensionBundleId
        ?? Bundle.main.infoDictionary?["RTCScreenSharingExtension"] as? String
    let picker = WindowBroadcastPicker.attached()
    picker.preferredExtension = preferred
    picker.showsMicrophoneButton = false
    return presentBroadcastPicker(on: picker)
}

/// A zero-size picker kept in the key window. A picker outside a window may not present its sheet.
@MainActor
private enum WindowBroadcastPicker {
    private static var picker: RPSystemBroadcastPickerView?

    static func attached() -> RPSystemBroadcastPickerView {
        let view = picker ?? RPSystemBroadcastPickerView(frame: .zero)
        picker = view
        view.isUserInteractionEnabled = false
        if let window = keyWindow(), view.window !== window {
            view.removeFromSuperview()
            window.addSubview(view)
        }
        return view
    }

    private static func keyWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
            .flatMap(\.windows)
        return windows.first(where: \.isKeyWindow) ?? windows.first
    }
}

@MainActor
@discardableResult
func presentBroadcastPicker(on view: RPSystemBroadcastPickerView) -> Bool {
    guard let button = view.subviews.first(where: { $0 is UIButton }) as? UIButton else {
        return false
    }
    button.sendActions(for: .touchUpInside)
    return true
}
