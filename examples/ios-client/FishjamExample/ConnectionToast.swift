import FishjamClient
import SwiftUI

enum ConnectionToast: Equatable {
    case disconnected
    case reconnecting
    case reconnected

    var title: String {
        switch self {
        case .disconnected:
            return "Disconnected"
        case .reconnecting:
            return "Reconnecting"
        case .reconnected:
            return "Reconnected"
        }
    }

    var color: Color {
        switch self {
        case .disconnected:
            return Color(red: 0.70, green: 0.15, blue: 0.12)
        case .reconnecting:
            return Color(red: 0.55, green: 0.42, blue: 0.00)
        case .reconnected:
            return Color(red: 0.11, green: 0.50, blue: 0.31)
        }
    }
}

struct ToastDecision: Equatable {
    var hasJoinedCall: Bool
    var toast: ConnectionToast?
    var autoDismiss: Bool
}

/// Toast rules for the example app:
/// - nothing until the first successful join
/// - "Reconnecting" and "Disconnected" stay until the call is connected again
/// - "Reconnected" is only for an automatic retry that succeeded, and the
///   caller hides it after a few seconds (`autoDismiss`)
/// - a manual leave sets `hasJoinedCall` to false before this runs, so the
///   Idle that follows does not show a toast
func decideConnectionToast(
    hasJoinedCall: Bool,
    peerStatus: PeerStatus,
    reconnectionStatus: ReconnectionStatus,
    current: ConnectionToast?
) -> ToastDecision {
    if !hasJoinedCall {
        return ToastDecision(
            hasJoinedCall: peerStatus == .connected,
            toast: nil,
            autoDismiss: false
        )
    }
    switch reconnectionStatus {
    case .reconnecting:
        return ToastDecision(hasJoinedCall: true, toast: .reconnecting, autoDismiss: false)
    case .error:
        return ToastDecision(hasJoinedCall: true, toast: .disconnected, autoDismiss: false)
    case .idle:
        return decideIdleToast(peerStatus: peerStatus, current: current)
    }
}

/// What to show once reconnection is idle again. `ReconnectionStatus.idle`
/// is emitted just before `peerStatus` becomes `.connected`, so an `.error`
/// peer that is still showing "Reconnecting" stays that way across the gap.
private func decideIdleToast(peerStatus: PeerStatus, current: ConnectionToast?) -> ToastDecision {
    switch peerStatus {
    case .error where current == .reconnecting:
        return ToastDecision(hasJoinedCall: true, toast: current, autoDismiss: false)
    case .error, .idle:
        return ToastDecision(hasJoinedCall: true, toast: .disconnected, autoDismiss: false)
    case .connected where current == .reconnecting:
        return ToastDecision(hasJoinedCall: true, toast: .reconnected, autoDismiss: true)
    case .connected where current == .disconnected:
        return ToastDecision(hasJoinedCall: true, toast: nil, autoDismiss: false)
    case .connected, .connecting:
        return ToastDecision(hasJoinedCall: true, toast: current, autoDismiss: false)
    }
}

struct ConnectionToastBanner: View {
    let toast: ConnectionToast

    var body: some View {
        Text(toast.title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(toast.color, in: Capsule())
            .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
            .accessibilityIdentifier("connection-toast")
    }
}
