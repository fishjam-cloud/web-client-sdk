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
/// `singleStreamKbps` applies to a non-simulcast video track other than screen
/// share. Screen share starts at the 1500 kbps cap.
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

    func toCore() -> CoreBandwidthLimits {
        CoreBandwidthLimits(
            singleStreamKbps: nonNegativeKbps(singleStreamKbps),
            lowKbps: nonNegativeKbps(lowKbps),
            mediumKbps: nonNegativeKbps(mediumKbps),
            highKbps: nonNegativeKbps(highKbps)
        )
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

    func toCore() -> CoreVideoConfig {
        switch mode {
        case .simulcast:
            return CoreVideoConfig(mode: .simulcast, sentQualities: sentQualities.map(\.core))
        case .single:
            return CoreVideoConfig(mode: .single, sentQualities: [])
        }
    }
}

/// One number for the whole track, or one number per simulcast layer. `0` means the cap.
public enum BandwidthLimit {
    case single(Int)
    case layers(lowKbps: Int, mediumKbps: Int, highKbps: Int)

    var singleKbps: UInt32? {
        guard case let .single(kbps) = self else { return nil }
        return nonNegativeKbps(kbps)
    }

    var layers: [CoreLayerBandwidth] {
        guard case let .layers(lowKbps, mediumKbps, highKbps) = self else { return [] }
        return [
            CoreLayerBandwidth(variant: .low, kbps: nonNegativeKbps(lowKbps)),
            CoreLayerBandwidth(variant: .medium, kbps: nonNegativeKbps(mediumKbps)),
            CoreLayerBandwidth(variant: .high, kbps: nonNegativeKbps(highKbps))
        ]
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
    var core: CoreVariant {
        switch self {
        case .low: return .low
        case .medium: return .medium
        case .high: return .high
        }
    }
}

func variant(of core: CoreVariant) -> Variant? {
    switch core {
    case .low: return .low
    case .medium: return .medium
    case .high: return .high
    case .unspecified: return nil
    }
}

func simulcastConfig(of core: CoreSimulcastConfig) -> SimulcastConfig {
    SimulcastConfig(
        enabled: core.enabled,
        enabledVariants: core.enabledVariants.compactMap(variant(of:)),
        disabledVariants: core.disabledVariants.compactMap(variant(of:))
    )
}

func nonNegativeKbps(_ kbps: Int) -> UInt32 {
    guard kbps > 0 else { return 0 }
    return UInt32(min(kbps, Int(UInt32.max)))
}
