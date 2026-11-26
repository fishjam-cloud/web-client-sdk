import Foundation
import WebRTC

extension MediaSession {
    func bind(trackId: String, track: RTCMediaStreamTrack, generation: Int) {
        queue.sync {
            let custom = customTracks.contains(ObjectIdentifier(track))
            if !custom {
                guard !stopped, generation == readGeneration() else { return }
                guard track === localVideo || track === localAudio || track === localScreen else { return }
            }
            mediaLock.lock()
            media[trackId] = track
            fishjamIdByWebrtcId[track.trackId] = trackId
            mediaLock.unlock()
            onMediaChanged()
        }
    }

    func createCustomVideoTrack() -> (RTCVideoSource, RTCVideoTrack) {
        queue.sync {
            let source = ensureFactory().videoSource()
            let track = ensureFactory().videoTrack(with: source, trackId: UUID().uuidString)
            track.isEnabled = true
            customTracks.insert(ObjectIdentifier(track))
            return (source, track)
        }
    }

    func unregisterCustomTrack(_ track: RTCMediaStreamTrack) {
        queue.sync {
            customTracks.remove(ObjectIdentifier(track))
            mediaLock.lock()
            media = media.filter { $0.value !== track }
            fishjamIdByWebrtcId.removeValue(forKey: track.trackId)
            mediaLock.unlock()
        }
    }
}
