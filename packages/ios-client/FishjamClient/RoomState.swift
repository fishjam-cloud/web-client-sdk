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
    public var simulcastConfig = SimulcastConfig.disabled
    public var encoding: Variant?
}

public struct Metadata {
    public var peer: Any?
    public var server: Any?
}

public struct PeerWithTracks {
    public var id: String
    public var metadata: Metadata?
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

/// The peer and track events of `FishjamEvent`. `nil` for every other core event.
func peerTrackEvent(of event: Fishjam_Sdk_SdkEvent, media: [String: RTCMediaStreamTrack]) -> FishjamEvent? {
    switch event.content {
    case .peerJoined?, .peerLeft?, .peerUpdated?:
        return peerEvent(of: event, media: media)
    case .trackAdded?, .trackReady?, .trackRemoved?, .trackUpdated?:
        return trackEvent(of: event, media: media)
    default:
        return nil
    }
}

private func peerEvent(of event: Fishjam_Sdk_SdkEvent, media: [String: RTCMediaStreamTrack]) -> FishjamEvent? {
    switch event.content {
    case let .peerJoined(joined)?:
        guard joined.hasPeer else { return nil }
        return .peerJoined(peer(of: joined.peer).attaching(media))
    case let .peerLeft(left)?:
        guard left.hasPeer else { return nil }
        return .peerLeft(peer(of: left.peer).attaching(media))
    case let .peerUpdated(updated)?:
        guard updated.hasPeer else { return nil }
        return .peerUpdated(peer(of: updated.peer).attaching(media))
    default:
        return nil
    }
}

private func trackEvent(of event: Fishjam_Sdk_SdkEvent, media: [String: RTCMediaStreamTrack]) -> FishjamEvent? {
    switch event.content {
    case let .trackAdded(added)?:
        guard added.hasTrack else { return nil }
        return .trackAdded(peerId: added.peerID, track: track(of: added.track).attaching(media))
    case let .trackReady(ready)?:
        guard ready.hasTrack else { return nil }
        return .trackReady(peerId: ready.peerID, track: track(of: ready.track).attaching(media))
    case let .trackRemoved(removed)?:
        guard removed.hasTrack else { return nil }
        return .trackRemoved(peerId: removed.peerID, track: track(of: removed.track).attaching(media))
    case let .trackUpdated(updated)?:
        guard updated.hasTrack else { return nil }
        return .trackUpdated(peerId: updated.peerID, track: track(of: updated.track).attaching(media))
    default:
        return nil
    }
}

/// Applies a peer or track event to the remote peers. Other events change nothing.
func applying(_ event: FishjamEvent, to room: RoomState) -> RoomState {
    var remote = room.remotePeers
    switch event {
    case let .peerJoined(peer), let .peerUpdated(peer):
        if let index = remote.firstIndex(where: { $0.id == peer.id }) {
            remote[index] = peer
        } else {
            remote.append(peer)
        }
    case let .peerLeft(peer):
        remote.removeAll { $0.id == peer.id }
    case let .trackAdded(peerId, track), let .trackReady(peerId, track), let .trackUpdated(peerId, track):
        remote = updating(remote, peerId: peerId) { peer in peer.replacing(track) }
    case let .trackRemoved(peerId, track):
        remote = updating(remote, peerId: peerId) { peer in peer.removing(track.trackId) }
    default:
        return room
    }
    return RoomState(localPeer: room.localPeer, remotePeers: remote)
}

private func updating(
    _ peers: [PeerWithTracks],
    peerId: String,
    _ change: (PeerWithTracks) -> PeerWithTracks
) -> [PeerWithTracks] {
    if let index = peers.firstIndex(where: { $0.id == peerId }) {
        var copy = peers
        copy[index] = change(copy[index])
        return copy
    }
    var created = PeerWithTracks.empty
    created.id = peerId
    return peers + [change(created)]
}

private extension PeerWithTracks {
    func replacing(_ track: Track) -> PeerWithTracks {
        var next = tracks.filter { $0.trackId != track.trackId }
        next.append(track)
        return splitPeer(id: id, metadata: metadata, tracks: next)
    }

    func removing(_ trackId: String) -> PeerWithTracks {
        splitPeer(id: id, metadata: metadata, tracks: tracks.filter { $0.trackId != trackId })
    }
}

private func splitPeer(id: String, metadata: Metadata?, tracks: [Track]) -> PeerWithTracks {
    PeerWithTracks(
        id: id,
        metadata: metadata,
        tracks: tracks,
        cameraTrack: tracks.first { $0.metadata?.type == "camera" },
        microphoneTrack: tracks.first { $0.metadata?.type == "microphone" },
        screenShareVideoTrack: tracks.first { $0.metadata?.type == "screenShareVideo" },
        screenShareAudioTrack: tracks.first { $0.metadata?.type == "screenShareAudio" },
        customVideoTracks: tracks.filter { $0.metadata?.type == "customVideo" },
        customAudioTracks: tracks.filter { $0.metadata?.type == "customAudio" }
    )
}

private func peer(of proto: Fishjam_Sdk_PeerState) -> PeerWithTracks {
    PeerWithTracks(
        id: proto.id,
        metadata: peerMetadata(proto.metadataJson),
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
        audioTrack: nil,
        simulcastConfig: proto.hasSimulcastConfig ? simulcastConfig(of: proto.simulcastConfig) : .disabled,
        encoding: variant(of: proto.encoding)
    )
}

private func metadata(of proto: Fishjam_Sdk_TrackMetadata) -> TrackMetadata {
    let displayName = proto.hasDisplayName && !proto.displayName.isEmpty ? proto.displayName : nil
    return TrackMetadata(type: trackTypeName(proto.type), paused: proto.paused, displayName: displayName)
}

private func peerMetadata(_ json: String) -> Metadata? {
    guard !json.isEmpty, let data = json.data(using: .utf8) else {
        return nil
    }
    guard let value = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else {
        return nil
    }
    if let object = value as? [String: Any], object.keys.allSatisfy({ $0 == "peer" || $0 == "server" }) {
        return Metadata(peer: object["peer"], server: object["server"])
    }
    return Metadata(peer: value)
}

func trackTypeName(_ type: Fishjam_Sdk_TrackType) -> String {
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
