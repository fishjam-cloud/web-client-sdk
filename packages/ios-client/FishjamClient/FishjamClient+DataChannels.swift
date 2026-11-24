import Foundation

extension FishjamClient {
    /// Opens the `reliable` (ordered) and `lossy` (unordered, no retransmits) data channels.
    /// Messages on them go to every peer in the room. Returns when the channels are ready or setup failed;
    /// failures go to `dataChannelError` instead of being thrown. Does nothing while ready or loading.
    /// The channels close when the peer leaves, disconnects or reconnects; call this again afterwards.
    @MainActor
    public func initializeDataChannel() async {
        let state = dataChannels.state
        if state.ready || state.loading { return }
        guard peerStatus == .connected else {
            dataChannels.reportError(DataChannelError("Peer is not connected"))
            applyDataChannelState(dataChannels.state)
            return
        }
        guard let core = activeCore, dataChannels.start() else { return }
        do {
            try core.createDataChannels()
        } catch let error as CoreError {
            dataChannels.fail(DataChannelError(error.detail))
        } catch {
            dataChannels.fail(error)
        }
        applyDataChannelState(dataChannels.state)
        for await loading in $dataChannelLoading.values where !loading {
            break
        }
    }

    /// Sends `payload` to every other peer, on the reliable channel when `reliable` is `true`,
    /// otherwise on the lossy one. When the channel is not open the error goes to `dataChannelError`.
    public func publishData(_ payload: Data, reliable: Bool) {
        do {
            try dataChannels.publish(payload, reliable: reliable)
        } catch {
            dataChannels.reportError(error)
        }
    }

    /// Calls `callback` on the main thread with every payload received on the chosen channel.
    /// Works before the channels exist and keeps working after a reconnect. Returns the unsubscribe function.
    @discardableResult
    public func subscribeData(reliable: Bool, _ callback: @escaping (Data) -> Void) -> () -> Void {
        dataChannels.subscribe(reliable: reliable, callback)
    }

    func applyDataChannelState(_ state: DataChannelState) {
        dataChannelReady = state.ready
        dataChannelLoading = state.loading
        dataChannelError = state.error
    }
}
