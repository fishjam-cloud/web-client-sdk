import Foundation
import WebRTC

/// The server accepts only these two labels.
enum DataChannelType: String, CaseIterable {
    case reliable
    case lossy

    init(reliable: Bool) {
        self = reliable ? .reliable : .lossy
    }

    var label: String { rawValue }
}

protocol DataChannelLink: AnyObject {
    var type: DataChannelType { get }
    func send(_ data: Data) -> Bool
    func close()
}

struct DataChannelState {
    var ready = false
    var loading = false
    var error: Error?
}

struct DataChannelError: LocalizedError {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? {
        message
    }
}

/// The `reliable` and `lossy` channels of one peer connection, their ready, loading and error state,
/// and the subscribers. Subscribers outlive the channels, so they keep receiving after a reconnect.
final class DataChannels: @unchecked Sendable {
    private let encode: (Data) -> Data
    private let decode: (Data) -> Data?
    private let deliver: (@escaping () -> Void) -> Void
    /// Called with the lock held, so changes arrive in order. Must not block.
    private let onChange: (DataChannelState) -> Void

    private let lock = NSRecursiveLock()
    private var current = DataChannelState()
    private var requested = false
    private var links: [DataChannelType: DataChannelLink] = [:]
    private var open: Set<DataChannelType> = []
    private var subscribers: [DataChannelType: [UUID: (Data) -> Void]] = [:]

    init(
        encode: @escaping (Data) -> Data,
        decode: @escaping (Data) -> Data?,
        deliver: @escaping (@escaping () -> Void) -> Void = { $0() },
        onChange: @escaping (DataChannelState) -> Void = { _ in }
    ) {
        self.encode = encode
        self.decode = decode
        self.deliver = deliver
        self.onChange = onChange
    }

    var state: DataChannelState {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    /// Returns `false` when the channels are already ready or being set up.
    func start() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if current.ready || current.loading { return false }
        requested = true
        update(DataChannelState(ready: false, loading: true, error: nil))
        return true
    }

    /// Must run before the offer is created, so the offer carries the channels.
    /// WebRTC calls run outside the lock: they block on the WebRTC thread that also reports channel state.
    func createMissing(_ create: (DataChannelType) -> DataChannelLink?) {
        lock.lock()
        let missing = requested ? DataChannelType.allCases.filter { links[$0] == nil } : []
        lock.unlock()
        for type in missing {
            guard let link = create(type) else {
                fail(DataChannelError("Data channel \(type.label) could not be created"))
                return
            }
            lock.lock()
            let kept = requested && links[type] == nil
            if kept {
                links[type] = link
            }
            lock.unlock()
            if !kept {
                link.close()
            }
        }
    }

    func onOpen(_ link: DataChannelLink) {
        lock.lock()
        defer { lock.unlock() }
        guard links[link.type] === link else { return }
        open.insert(link.type)
        if open.count == DataChannelType.allCases.count {
            update(DataChannelState(ready: true, loading: false, error: nil))
        }
    }

    func onClosed(_ link: DataChannelLink) {
        lock.lock()
        guard links[link.type] === link else {
            lock.unlock()
            return
        }
        var closing: [DataChannelLink] = []
        if open.contains(link.type) {
            open.remove(link.type)
            links[link.type] = nil
            var next = current
            next.ready = false
            update(next)
        } else {
            closing = failLocked(DataChannelError("Data channel \(link.type.label) closed before opening"))
        }
        lock.unlock()
        closing.forEach { $0.close() }
    }

    func onMessage(_ link: DataChannelLink, _ bytes: Data) {
        guard let payload = decode(bytes) else {
            NSLog("Fishjam: dropped a data channel message that is not a binary ChannelMessage")
            return
        }
        lock.lock()
        let targets = Array((subscribers[link.type] ?? [:]).values)
        lock.unlock()
        guard !targets.isEmpty else { return }
        deliver { targets.forEach { $0(payload) } }
    }

    func fail(_ error: Error) {
        lock.lock()
        let closing = failLocked(error)
        lock.unlock()
        closing.forEach { $0.close() }
    }

    func reportError(_ error: Error) {
        lock.lock()
        defer { lock.unlock() }
        var next = current
        next.error = error
        update(next)
    }

    func publish(_ payload: Data, reliable: Bool) throws {
        let type = DataChannelType(reliable: reliable)
        lock.lock()
        let link = open.contains(type) ? links[type] : nil
        lock.unlock()
        guard let link else {
            throw DataChannelError("Data channel \(type.label) is not open. Call initializeDataChannel() first.")
        }
        if !link.send(encode(payload)) {
            NSLog("Fishjam: data channel %@ send failed", type.label)
        }
    }

    func subscribe(reliable: Bool, _ callback: @escaping (Data) -> Void) -> () -> Void {
        let type = DataChannelType(reliable: reliable)
        let id = UUID()
        lock.lock()
        subscribers[type, default: [:]][id] = callback
        lock.unlock()
        return { [weak self] in
            guard let self else { return }
            self.lock.lock()
            self.subscribers[type]?[id] = nil
            self.lock.unlock()
        }
    }

    /// The peer connection is gone. The app calls `initializeDataChannel` again on the next one.
    func reset() {
        lock.lock()
        requested = false
        var next = current
        next.ready = false
        next.loading = false
        update(next)
        let closing = takeLinksLocked()
        lock.unlock()
        closing.forEach { $0.close() }
    }

    private func failLocked(_ error: Error) -> [DataChannelLink] {
        requested = false
        update(DataChannelState(ready: false, loading: false, error: error))
        return takeLinksLocked()
    }

    private func takeLinksLocked() -> [DataChannelLink] {
        let closing = Array(links.values)
        links.removeAll()
        open.removeAll()
        return closing
    }

    private func update(_ next: DataChannelState) {
        let same = next.ready == current.ready && next.loading == current.loading
            && next.error == nil && current.error == nil
        current = next
        if !same {
            onChange(next)
        }
    }
}

/// One `RTCDataChannel`. Its delegate runs on a WebRTC thread.
final class WebRtcDataChannelLink: NSObject, DataChannelLink, RTCDataChannelDelegate {
    let type: DataChannelType
    private weak var channels: DataChannels?
    private let lock = NSLock()
    private var channel: RTCDataChannel?

    private init(type: DataChannelType, channels: DataChannels) {
        self.type = type
        self.channels = channels
    }

    static func create(
        on connection: RTCPeerConnection,
        type: DataChannelType,
        channels: DataChannels
    ) -> DataChannelLink? {
        let configuration = RTCDataChannelConfiguration()
        configuration.isOrdered = type == .reliable
        if type == .lossy {
            configuration.maxRetransmits = 0
        }
        guard let created = connection.dataChannel(forLabel: type.label, configuration: configuration) else {
            return nil
        }
        let link = WebRtcDataChannelLink(type: type, channels: channels)
        link.channel = created
        created.delegate = link
        return link
    }

    func send(_ data: Data) -> Bool {
        lock.lock()
        let current = channel
        lock.unlock()
        return current?.sendData(RTCDataBuffer(data: data, isBinary: true)) ?? false
    }

    func close() {
        lock.lock()
        let current = channel
        channel = nil
        lock.unlock()
        current?.delegate = nil
        current?.close()
    }

    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        switch dataChannel.readyState {
        case .open:
            channels?.onOpen(self)
        case .closed:
            channels?.onClosed(self)
        default:
            break
        }
    }

    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        channels?.onMessage(self, buffer.data)
    }
}
