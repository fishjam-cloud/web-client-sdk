import Foundation

/// One simulcast layer. Low is the smallest picture, high is the full picture.
public enum Variant {
    case low
    case medium
    case high
}

/// App limits for outgoing video, in kbps (1 kbps = 1024 bps).
/// `0` or a negative value uses the cap. A value above the cap is clamped.
/// The caps are 1500 kbps for one encoding, and 150 / 500 / 1500 for the
/// low / medium / high layers.
public struct BandwidthLimits {
    public var singleStreamKbps: Int
    public var lowKbps: Int
    public var mediumKbps: Int
    public var highKbps: Int

    public init(
        singleStreamKbps: Int = 1500,
        lowKbps: Int = 150,
        mediumKbps: Int = 500,
        highKbps: Int = 1500
    ) {
        self.singleStreamKbps = singleStreamKbps
        self.lowKbps = lowKbps
        self.mediumKbps = mediumKbps
        self.highKbps = highKbps
    }

    func toProto() -> Fishjam_Sdk_BandwidthLimits {
        var limits = Fishjam_Sdk_BandwidthLimits()
        limits.singleStreamKbps = nonNegativeKbps(singleStreamKbps)
        limits.lowKbps = nonNegativeKbps(lowKbps)
        limits.mediumKbps = nonNegativeKbps(mediumKbps)
        limits.highKbps = nonNegativeKbps(highKbps)
        return limits
    }
}

/// Which camera layers to send. Other video tracks always send one encoding.
public enum VideoSendMode {
    case simulcast
    case single
}

/// Camera layers to send. `.simulcast` with an empty `sentQualities` list
/// sends low, medium, and high. A layer left out of the list stays in the
/// offer with `active = false`.
public struct VideoConfig {
    public var mode: VideoSendMode
    public var sentQualities: [Variant]

    public init(
        mode: VideoSendMode = .simulcast,
        sentQualities: [Variant] = [.low, .medium, .high]
    ) {
        self.mode = mode
        self.sentQualities = sentQualities
    }

    func toProto() -> Fishjam_Sdk_VideoConfig {
        var config = Fishjam_Sdk_VideoConfig()
        switch mode {
        case .simulcast:
            config.mode = .simulcast
            config.sentQualities = sentQualities.map(\.proto)
        case .single:
            config.mode = .single
        }
        return config
    }
}

/// One number for the whole track, or one number per simulcast layer. `0` means the cap.
public enum BandwidthLimit {
    case single(Int)
    case layers(lowKbps: Int, mediumKbps: Int, highKbps: Int)

    func protoRequest(trackId: String) -> Fishjam_Sdk_SetTrackBandwidth {
        var request = Fishjam_Sdk_SetTrackBandwidth()
        request.trackID = trackId
        switch self {
        case let .single(kbps):
            request.singleKbps = nonNegativeKbps(kbps)
        case let .layers(lowKbps, mediumKbps, highKbps):
            request.layers = [
                layerBandwidth(.low, lowKbps),
                layerBandwidth(.medium, mediumKbps),
                layerBandwidth(.high, highKbps)
            ]
        }
        return request
    }
}

/// Which simulcast layers a track is allowed to use.
public struct SimulcastConfig {
    public var enabled: Bool
    public var enabledVariants: [Variant]
    public var disabledVariants: [Variant]

    public static let disabled = SimulcastConfig(
        enabled: false,
        enabledVariants: [],
        disabledVariants: []
    )
}

extension Variant {
    var proto: Fishjam_Sdk_Variant {
        switch self {
        case .low: return .low
        case .medium: return .medium
        case .high: return .high
        }
    }
}

func variant(of proto: Fishjam_Sdk_Variant) -> Variant? {
    switch proto {
    case .low: return .low
    case .medium: return .medium
    case .high: return .high
    default: return nil
    }
}

func simulcastConfig(of proto: Fishjam_Sdk_SimulcastConfig) -> SimulcastConfig {
    SimulcastConfig(
        enabled: proto.enabled,
        enabledVariants: proto.enabledVariants.compactMap(variant(of:)),
        disabledVariants: proto.disabledVariants.compactMap(variant(of:))
    )
}

private func layerBandwidth(_ variant: Variant, _ kbps: Int) -> Fishjam_Sdk_LayerBandwidth {
    var layer = Fishjam_Sdk_LayerBandwidth()
    layer.variant = variant.proto
    layer.kbps = nonNegativeKbps(kbps)
    return layer
}

private func nonNegativeKbps(_ kbps: Int) -> UInt32 {
    guard kbps > 0 else { return 0 }
    return UInt32(min(kbps, Int(UInt32.max)))
}
