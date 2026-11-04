import Foundation
import Network

/// Watches the OS network path and reports changes to the core so a dropped
/// call waits while the device has no network, then retries as soon as a
/// path exists again.
final class NetworkMonitor {
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "io.fishjam.network-monitor")
    private let onChange: (Bool, String) -> Void

    init(onChange: @escaping (Bool, String) -> Void) {
        self.onChange = onChange
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            self.onChange(Self.isOnline(path), Self.networkId(path))
        }
    }

    func start() {
        monitor.start(queue: queue)
    }

    func stop() {
        monitor.cancel()
    }

    /// Airplane mode makes the path `.unsatisfied`. A path that is
    /// `.satisfied` only because of a link-local or other non-routed
    /// interface is also offline: there is no network to reconnect on.
    private static func isOnline(_ path: NWPath) -> Bool {
        guard path.status == .satisfied else { return false }
        return path.usesInterfaceType(.wifi)
            || path.usesInterfaceType(.cellular)
            || path.usesInterfaceType(.wiredEthernet)
    }

    /// Transport of the current path, empty when offline. Interface names
    /// are left out so a Wi-Fi roam does not look like a new network.
    private static func networkId(_ path: NWPath) -> String {
        guard isOnline(path) else { return "" }
        var parts: [String] = []
        if path.usesInterfaceType(.wifi) { parts.append("wifi") }
        if path.usesInterfaceType(.cellular) { parts.append("cellular") }
        if path.usesInterfaceType(.wiredEthernet) { parts.append("wired") }
        return parts.joined(separator: ",")
    }
}
