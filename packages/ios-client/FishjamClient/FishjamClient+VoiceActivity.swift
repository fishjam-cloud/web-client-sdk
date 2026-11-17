import Foundation

extension FishjamClient {
    /// Polls the published microphone while the client is connected.
    /// Stops and reports silence when the microphone track goes away.
    func startLocalVoiceActivity() {
        guard localVoiceTask == nil else { return }
        localVoiceTask = Task { [weak self] in
            var detector = SpeakingDetector()
            var polling = false
            while !Task.isCancelled {
                guard let self else { return }
                let trackId = await MainActor.run { self.publishedMicrophoneTrackId() }
                if Task.isCancelled { return }
                if let trackId {
                    polling = true
                    let sample = await self.getLocalTrackAudioLevel(trackId: trackId)
                    let next = detector.onLevel(sample)
                    await MainActor.run { self.applyLocalVad(next) }
                } else if polling {
                    polling = false
                    detector.reset()
                    await MainActor.run { self.applyLocalVad(.silence) }
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
        }
    }

    func publishedMicrophoneTrackId() -> String? {
        guard peerStatus == .connected, isMicrophoneOn else { return nil }
        guard let trackId = roomState.localPeer?.microphoneTrack?.trackId, !trackId.isEmpty else {
            return nil
        }
        return trackId
    }

    func applyLocalVad(_ status: VadStatus) {
        let current = roomState.localPeer?.microphoneTrack?.vadStatus
        if status == localVadStatus && current == status { return }
        let previous = localVadStatus
        localVadStatus = status
        setRoom(roomState)
        guard previous != status,
              let peer = roomState.localPeer,
              let trackId = peer.microphoneTrack?.trackId,
              !trackId.isEmpty
        else { return }
        emit(.voiceActivityChanged(peerId: peer.id, trackId: trackId, vadStatus: status))
    }

    func stopLocalVoiceActivity() {
        let previous = localVadStatus
        localVadStatus = .silence
        guard previous == .speech,
              let peer = roomState.localPeer,
              let trackId = peer.microphoneTrack?.trackId,
              !trackId.isEmpty
        else { return }
        emit(.voiceActivityChanged(peerId: peer.id, trackId: trackId, vadStatus: .silence))
    }
}
