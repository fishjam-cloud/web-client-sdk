import Foundation
import WebRTC

public typealias VideoTrack = RTCVideoTrack
public typealias AudioTrack = RTCAudioTrack

public struct TrackMetadata {
    public var type: String
    public var paused: Bool
    public var displayName: String?
}

public enum VadStatus: Equatable {
    case silence
    case speech
}

public struct Track {
    public var trackId: String
    public var metadata: TrackMetadata?
    public var videoTrack: VideoTrack?
    public var audioTrack: AudioTrack?
    public var simulcastConfig = SimulcastConfig.disabled
    public var encoding: Variant?
    public var vadStatus = VadStatus.silence
}

public struct Metadata {
    public var peer: Any?
    public var server: Any?
}

/// Display name from the local peer metadata, when that metadata is a dictionary with a string.
func customSourceDisplayName(_ metadata: Metadata?) -> String? {
    guard let peer = metadata?.peer as? [String: Any] else { return nil }
    guard let name = peer["displayName"] as? String, !name.isEmpty else { return nil }
    return name
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

func makeRoomState(_ core: CoreRoomState) -> RoomState {
    RoomState(
        localPeer: core.localPeer.map(peer(of:)),
        remotePeers: core.remotePeers.map(peer(of:))
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
func peerTrackEvent(of event: CoreEvent, media: [String: RTCMediaStreamTrack]) -> FishjamEvent? {
    switch event {
    case let .peerJoined(core):
        return .peerJoined(peer(of: core).attaching(media))
    case let .peerLeft(core):
        return .peerLeft(peer(of: core).attaching(media))
    case let .peerUpdated(core):
        return .peerUpdated(peer(of: core).attaching(media))
    case let .trackAdded(peerId, core):
        return .trackAdded(peerId: peerId, track: track(of: core).attaching(media))
    case let .trackReady(peerId, core):
        return .trackReady(peerId: peerId, track: track(of: core).attaching(media))
    case let .trackRemoved(peerId, core):
        return .trackRemoved(peerId: peerId, track: track(of: core).attaching(media))
    case let .trackUpdated(peerId, core):
        return .trackUpdated(peerId: peerId, track: track(of: core).attaching(media))
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

private func peer(of core: CorePeerState) -> PeerWithTracks {
    PeerWithTracks(
        id: core.id,
        metadata: peerMetadata(core.metadataJson),
        tracks: core.tracks.map(track(of:)),
        cameraTrack: core.cameraTrack.map(track(of:)),
        microphoneTrack: core.microphoneTrack.map(track(of:)),
        screenShareVideoTrack: core.screenShareVideoTrack.map(track(of:)),
        screenShareAudioTrack: core.screenShareAudioTrack.map(track(of:)),
        customVideoTracks: core.customVideoTracks.map(track(of:)),
        customAudioTracks: core.customAudioTracks.map(track(of:))
    )
}

private func track(of core: CoreTrackState) -> Track {
    Track(
        trackId: core.trackId,
        metadata: metadata(of: core.metadata),
        videoTrack: nil,
        audioTrack: nil,
        simulcastConfig: simulcastConfig(of: core.simulcastConfig),
        encoding: variant(of: core.encoding),
        vadStatus: vadStatus(of: core.vadStatus)
    )
}

func vadStatus(of status: CoreVadStatus) -> VadStatus {
    switch status {
    case .speech:
        return .speech
    case .silence:
        return .silence
    }
}

/// Local peer first, then remote peers. A peer with no microphone is silent.
func voiceActivityMap(of room: RoomState) -> [String: Bool] {
    var speaking: [String: Bool] = [:]
    if let local = room.localPeer {
        speaking[local.id] = local.microphoneTrack?.vadStatus == .speech
    }
    for peer in room.remotePeers {
        speaking[peer.id] = peer.microphoneTrack?.vadStatus == .speech
    }
    return speaking
}

extension PeerWithTracks {
    func withMicrophoneVad(_ status: VadStatus) -> PeerWithTracks {
        guard var mic = microphoneTrack, mic.vadStatus != status else { return self }
        mic.vadStatus = status
        var copy = self
        copy.microphoneTrack = mic
        if let index = copy.tracks.firstIndex(where: { $0.trackId == mic.trackId }) {
            copy.tracks[index].vadStatus = status
        }
        return copy
    }
}

extension RoomState {
    func applyingLocalMicrophoneVad(_ status: VadStatus) -> RoomState {
        guard let local = localPeer, let mic = local.microphoneTrack, mic.vadStatus != status else {
            return self
        }
        var copy = self
        copy.localPeer = local.withMicrophoneVad(status)
        return copy
    }
}

private func metadata(of core: CoreTrackMetadata) -> TrackMetadata {
    let displayName = core.displayName?.isEmpty == false ? core.displayName : nil
    return TrackMetadata(type: trackTypeName(core.trackType), paused: core.paused, displayName: displayName)
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

func trackTypeName(_ type: CoreTrackType) -> String {
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
    case .unspecified:
        return ""
    }
}
