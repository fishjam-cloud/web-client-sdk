import Foundation
import WebRTC

public typealias VideoTrack = RTCVideoTrack
public typealias AudioTrack = RTCAudioTrack

public struct TrackMetadata {
    public var type: String
    public var paused: Bool
    public var displayName: String?
}

public struct Track {
    public var trackId: String
    public var metadata: TrackMetadata?
    public var videoTrack: VideoTrack?
    public var audioTrack: AudioTrack?
}

public struct PeerWithTracks {
    public var id: String
    public var metadata: [String: Any]?
    public var tracks: [Track]
    public var cameraTrack: Track?
    public var microphoneTrack: Track?
    public var screenShareVideoTrack: Track?
    public var screenShareAudioTrack: Track?
    public var customVideoTracks: [Track]
    public var customAudioTracks: [Track]

    static let empty = PeerWithTracks(
        id: "",
        metadata: nil,
        tracks: [],
        cameraTrack: nil,
        microphoneTrack: nil,
        screenShareVideoTrack: nil,
        screenShareAudioTrack: nil,
        customVideoTracks: [],
        customAudioTracks: []
    )
}

public struct RoomState {
    public var localPeer: PeerWithTracks?
    public var remotePeers: [PeerWithTracks]

    public static let empty = RoomState(localPeer: nil, remotePeers: [])
}

func makeRoomState(_ proto: Fishjam_Sdk_RoomState) -> RoomState {
    RoomState(
        localPeer: proto.hasLocalPeer ? peer(of: proto.localPeer) : nil,
        remotePeers: proto.remotePeers.map(peer(of:))
    )
}

extension RoomState {
    func attaching(_ media: [String: RTCMediaStreamTrack]) -> RoomState {
        RoomState(
            localPeer: localPeer?.attaching(media),
            remotePeers: remotePeers.map { peer in peer.attaching(media) }
        )
    }
}

private extension PeerWithTracks {
    func attaching(_ media: [String: RTCMediaStreamTrack]) -> PeerWithTracks {
        var copy = self
        copy.tracks = tracks.map { track in track.attaching(media) }
        copy.cameraTrack = cameraTrack?.attaching(media)
        copy.microphoneTrack = microphoneTrack?.attaching(media)
        copy.screenShareVideoTrack = screenShareVideoTrack?.attaching(media)
        copy.screenShareAudioTrack = screenShareAudioTrack?.attaching(media)
        copy.customVideoTracks = customVideoTracks.map { track in track.attaching(media) }
        copy.customAudioTracks = customAudioTracks.map { track in track.attaching(media) }
        return copy
    }
}

private extension Track {
    func attaching(_ media: [String: RTCMediaStreamTrack]) -> Track {
        guard let stream = media[trackId] else {
            return self
        }
        var copy = self
        if let video = stream as? VideoTrack {
            copy.videoTrack = video
            copy.audioTrack = nil
        } else if let audio = stream as? AudioTrack {
            copy.videoTrack = nil
            copy.audioTrack = audio
        }
        return copy
    }
}

private func peer(of proto: Fishjam_Sdk_PeerState) -> PeerWithTracks {
    PeerWithTracks(
        id: proto.id,
        metadata: metadataObject(proto.metadataJson),
        tracks: proto.tracks.map(track(of:)),
        cameraTrack: proto.hasCameraTrack ? track(of: proto.cameraTrack) : nil,
        microphoneTrack: proto.hasMicrophoneTrack ? track(of: proto.microphoneTrack) : nil,
        screenShareVideoTrack: proto.hasScreenShareVideoTrack ? track(of: proto.screenShareVideoTrack) : nil,
        screenShareAudioTrack: proto.hasScreenShareAudioTrack ? track(of: proto.screenShareAudioTrack) : nil,
        customVideoTracks: proto.customVideoTracks.map(track(of:)),
        customAudioTracks: proto.customAudioTracks.map(track(of:))
    )
}

private func track(of proto: Fishjam_Sdk_TrackState) -> Track {
    Track(
        trackId: proto.trackID,
        metadata: proto.hasMetadata ? metadata(of: proto.metadata) : nil,
        videoTrack: nil,
        audioTrack: nil
    )
}

private func metadata(of proto: Fishjam_Sdk_TrackMetadata) -> TrackMetadata {
    let displayName = proto.hasDisplayName && !proto.displayName.isEmpty ? proto.displayName : nil
    return TrackMetadata(type: trackTypeName(proto.type), paused: proto.paused, displayName: displayName)
}

private func metadataObject(_ json: String) -> [String: Any]? {
    guard !json.isEmpty, let data = json.data(using: .utf8) else {
        return nil
    }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
}

private func trackTypeName(_ type: Fishjam_Sdk_TrackType) -> String {
    switch type {
    case .camera:
        return "camera"
    case .microphone:
        return "microphone"
    case .screenShareVideo:
        return "screenShareVideo"
    case .screenShareAudio:
        return "screenShareAudio"
    case .customVideo:
        return "customVideo"
    case .customAudio:
        return "customAudio"
    case .unspecified, .UNRECOGNIZED:
        return ""
    }
}
