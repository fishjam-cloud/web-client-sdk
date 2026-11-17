import ReplayKit

/// Broadcast Upload Extension entry point. Copy this target into the app project,
/// set the App Group id in the extension Info.plist under `RTCAppGroupIdentifier`,
/// and match that group on the host app.
class SampleHandler: RPBroadcastSampleHandler {
    private var clientConnection: SocketConnection?
    private var uploader: SampleUploader?
    private var frameCount: Int = 0

    private var appGroupIdentifier: String {
        Bundle.main.object(forInfoDictionaryKey: "RTCAppGroupIdentifier") as? String ?? ""
    }

    private var socketFilePath: String {
        let sharedContainer = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        )
        return sharedContainer?.appendingPathComponent("rtc_SSFD").path ?? ""
    }

    override init() {
        super.init()
        if let connection = SocketConnection(filePath: socketFilePath) {
            clientConnection = connection
            setupConnection()
            uploader = SampleUploader(connection: connection)
        }
    }

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        frameCount = 0
        DarwinNotificationCenter.shared.postNotification(.broadcastStarted)
        openConnection()
    }

    override func broadcastPaused() {}

    override func broadcastResumed() {}

    override func broadcastFinished() {
        DarwinNotificationCenter.shared.postNotification(.broadcastStopped)
        clientConnection?.close()
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        switch sampleBufferType {
        case .video:
            frameCount += 1
            if frameCount % 3 == 0 {
                uploader?.send(sample: sampleBuffer)
            }
        default:
            break
        }
    }

    private func setupConnection() {
        clientConnection?.didClose = { [weak self] error in
            if let error {
                self?.finishBroadcastWithError(error)
            } else {
                let customError = NSError(
                    domain: RPRecordingErrorDomain,
                    code: 10001,
                    userInfo: [NSLocalizedDescriptionKey: "Screen sharing stopped"]
                )
                self?.finishBroadcastWithError(customError)
            }
        }
    }

    private func openConnection() {
        let queue = DispatchQueue(label: "broadcast.connectTimer")
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(100), leeway: .milliseconds(500))
        timer.setEventHandler { [weak self] in
            guard self?.clientConnection?.open() == true else {
                return
            }
            timer.cancel()
        }
        timer.resume()
    }
}
