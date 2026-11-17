import CoreVideo
import Foundation
import ImageIO
import WebRTC

private let maxReadLength = 10 * 1024
private let socketFileName = "rtc_SSFD"

/// Listens for JPEG frames from the Broadcast Upload Extension over a Unix socket
/// in the App Group container, and feeds them into a WebRTC video source.
final class ScreenCapturer: NSObject {
    weak var videoSource: RTCVideoSource?
    var onEnded: (() -> Void)?

    private let appGroupId: String
    private var serverSocket: Int32 = -1
    private var listeningSource: DispatchSourceRead?
    private var inputStream: InputStream?
    private var outputStream: OutputStream?
    private var networkThread: Thread?
    private var message: ScreenCaptureMessage?
    private var readLength = maxReadLength
    private let readyLock = NSLock()
    private var readyHandler: (() -> Void)?
    private var isCaptureReady = false
    private var timebaseInfo = mach_timebase_info_data_t()
    private var startTimeStampNs: Int64 = -1
    private let capturer = RTCVideoCapturer()

    init(appGroupId: String) {
        self.appGroupId = appGroupId
        super.init()
        mach_timebase_info(&timebaseInfo)
    }

    func start() throws {
        guard let shared = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupId
        ) else {
            throw MediaError.screenShareFailed("App Group container not found for \(appGroupId)")
        }
        let path = shared.appendingPathComponent(socketFileName).path
        try openServer(at: path)
    }

    /// Sets the handler for the first frame. Calls it right away when a frame already arrived.
    func whenReady(_ handler: @escaping () -> Void) {
        readyLock.lock()
        readyHandler = handler
        let ready = isCaptureReady
        readyLock.unlock()
        if ready {
            handler()
        }
    }

    func stop() {
        closeStreams()
        if let listeningSource {
            listeningSource.cancel()
            self.listeningSource = nil
        }
        if serverSocket >= 0 {
            Darwin.close(serverSocket)
            serverSocket = -1
        }
        message = nil
        readyLock.lock()
        isCaptureReady = false
        readyLock.unlock()
        startTimeStampNs = -1
    }

    private func markReady() {
        readyLock.lock()
        let first = !isCaptureReady
        isCaptureReady = true
        let handler = readyHandler
        readyLock.unlock()
        if first {
            handler?()
        }
    }

    private func openServer(at path: String) throws {
        stop()
        serverSocket = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverSocket >= 0 else {
            throw MediaError.screenShareFailed("Could not create screen share socket")
        }

        unlink(path)
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = path.utf8CString
        guard pathBytes.count <= MemoryLayout.size(ofValue: addr.sun_path) else {
            Darwin.close(serverSocket)
            serverSocket = -1
            throw MediaError.screenShareFailed("Screen share socket path is too long")
        }
        withUnsafeMutablePointer(to: &addr.sun_path.0) { ptr in
            path.withCString { cString in
                strncpy(ptr, cString, pathBytes.count)
            }
        }

        let bindStatus = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(serverSocket, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindStatus == 0 else {
            Darwin.close(serverSocket)
            serverSocket = -1
            throw MediaError.screenShareFailed("Could not bind screen share socket")
        }

        guard Darwin.listen(serverSocket, 10) == 0 else {
            Darwin.close(serverSocket)
            serverSocket = -1
            throw MediaError.screenShareFailed("Could not listen on screen share socket")
        }

        let source = DispatchSource.makeReadSource(fileDescriptor: serverSocket, queue: .global(qos: .userInitiated))
        source.setEventHandler { [weak self] in
            self?.acceptClient()
        }
        listeningSource = source
        source.resume()
    }

    private func acceptClient() {
        let client = Darwin.accept(serverSocket, nil, nil)
        guard client >= 0 else { return }
        closeStreams()
        message = nil

        var readStream: Unmanaged<CFReadStream>?
        var writeStream: Unmanaged<CFWriteStream>?
        CFStreamCreatePairWithSocket(kCFAllocatorDefault, client, &readStream, &writeStream)

        let input = readStream?.takeRetainedValue() as InputStream?
        let output = writeStream?.takeRetainedValue() as OutputStream?
        input?.delegate = self
        input?.setProperty(
            kCFBooleanTrue,
            forKey: Stream.PropertyKey(kCFStreamPropertyShouldCloseNativeSocket as String)
        )
        output?.setProperty(
            kCFBooleanTrue,
            forKey: Stream.PropertyKey(kCFStreamPropertyShouldCloseNativeSocket as String)
        )

        let thread = Thread { [weak self] in
            guard let self else { return }
            self.inputStream?.schedule(in: .current, forMode: .common)
            self.outputStream?.schedule(in: .current, forMode: .common)
            self.inputStream?.open()
            self.outputStream?.open()
            while !Thread.current.isCancelled {
                RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))
            }
        }
        thread.qualityOfService = .userInitiated
        inputStream = input
        outputStream = output
        networkThread = thread
        thread.start()
    }

    private func closeStreams() {
        inputStream?.delegate = nil
        outputStream?.delegate = nil
        inputStream?.close()
        outputStream?.close()
        inputStream = nil
        outputStream = nil
        networkThread?.cancel()
        networkThread = nil
    }

    private func readBytes(from stream: InputStream) {
        guard stream.hasBytesAvailable else { return }

        if message == nil {
            let next = ScreenCaptureMessage()
            message = next
            readLength = maxReadLength
            next.didComplete = { [weak self] success, completed in
                guard let self else { return }
                if success, let buffer = completed.imageBuffer {
                    self.markReady()
                    self.didCapture(buffer, orientation: completed.imageOrientation)
                }
                self.message = nil
            }
        }

        var buffer = [UInt8](repeating: 0, count: readLength)
        let numberOfBytesRead = stream.read(&buffer, maxLength: readLength)
        guard numberOfBytesRead >= 0, let message else { return }

        let missing = message.append(bytes: &buffer, length: numberOfBytesRead)
        if missing == -1 || missing > maxReadLength {
            readLength = maxReadLength
        } else {
            readLength = missing
        }
    }

    private func didCapture(_ pixelBuffer: CVPixelBuffer, orientation: UInt32) {
        guard let videoSource else { return }
        let currentTime = mach_absolute_time()
        let currentTimeStampNs = Int64(currentTime) * Int64(timebaseInfo.numer) / Int64(timebaseInfo.denom)
        if startTimeStampNs < 0 {
            startTimeStampNs = currentTimeStampNs
        }
        let rtcBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let rotation: RTCVideoRotation
        switch CGImagePropertyOrientation(rawValue: orientation) {
        case .left:
            rotation = ._90
        case .down:
            rotation = ._180
        case .right:
            rotation = ._270
        default:
            rotation = ._0
        }
        let frameTimeStampNs = currentTimeStampNs - startTimeStampNs
        // Local Metal rendering of RTCCVPixelBuffer fails for screen share; I420 fixes the preview.
        let frame = RTCVideoFrame(buffer: rtcBuffer, rotation: rotation, timeStampNs: frameTimeStampNs)
            .newI420()
        videoSource.capturer(capturer, didCapture: frame)
    }
}

extension ScreenCapturer: StreamDelegate {
    func stream(_ aStream: Stream, handle eventCode: Stream.Event) {
        switch eventCode {
        case .openCompleted:
            break
        case .hasBytesAvailable:
            if let input = aStream as? InputStream {
                readBytes(from: input)
            }
        case .endEncountered:
            closeStreams()
            onEnded?()
        case .errorOccurred:
            break
        default:
            break
        }
    }
}

/// Reassembles one framed JPEG message from the broadcast extension.
final class ScreenCaptureMessage {
    private(set) var imageBuffer: CVPixelBuffer?
    private(set) var imageOrientation: UInt32 = 0
    var didComplete: ((Bool, ScreenCaptureMessage) -> Void)?

    private var framedMessage: CFHTTPMessage?

    /// Returns missing body bytes, or -1 when the header is not complete yet.
    func append(bytes buffer: UnsafeMutablePointer<UInt8>, length: Int) -> Int {
        if framedMessage == nil {
            framedMessage = CFHTTPMessageCreateEmpty(kCFAllocatorDefault, false).takeRetainedValue()
        }
        guard let framedMessage else { return -1 }

        CFHTTPMessageAppendBytes(framedMessage, buffer, length)
        guard CFHTTPMessageIsHeaderComplete(framedMessage) else {
            return -1
        }

        let contentLengthValue = header("Content-Length").flatMap(Int.init) ?? 0
        let bodyLength = (CFHTTPMessageCopyBody(framedMessage)?.takeRetainedValue() as Data?)?.count ?? 0
        let missing = contentLengthValue - bodyLength
        if missing == 0 {
            let success = unwrap(framedMessage)
            didComplete?(success, self)
            self.framedMessage = nil
        }
        return missing
    }

    private func header(_ name: String) -> String? {
        guard let framedMessage else { return nil }
        return CFHTTPMessageCopyHeaderFieldValue(framedMessage, name as CFString)?.takeRetainedValue() as String?
    }

    private func unwrap(_ framedMessage: CFHTTPMessage) -> Bool {
        let width = header("Buffer-Width").flatMap(Int.init) ?? 0
        let height = header("Buffer-Height").flatMap(Int.init) ?? 0
        imageOrientation = header("Buffer-Orientation").flatMap(UInt32.init) ?? 0
        guard let messageData = CFHTTPMessageCopyBody(framedMessage)?.takeRetainedValue() as Data? else {
            return false
        }
        var buffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            width,
            height,
            kCVPixelFormatType_32BGRA,
            nil,
            &buffer
        )
        guard status == kCVReturnSuccess, let pixelBuffer = buffer else {
            return false
        }
        copy(imageData: messageData, to: pixelBuffer)
        imageBuffer = pixelBuffer
        return true
    }

    private func copy(imageData: Data, to pixelBuffer: CVPixelBuffer) {
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        guard let image = CIImage(data: imageData) else { return }
        ScreenCaptureMessage.imageContext.render(image, to: pixelBuffer)
    }

    private static let imageContext = CIContext(options: nil)
}
