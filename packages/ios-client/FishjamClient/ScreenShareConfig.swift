import Foundation

/// How the host app finds the Broadcast Upload Extension and the App Group socket.
///
/// When omitted, the SDK reads the same Info.plist keys the React Native plugin writes:
/// `RTCAppGroupIdentifier` and `RTCScreenSharingExtension`.
public struct ScreenShareConfig: Equatable, Sendable {
    public let appGroupId: String
    public let extensionBundleId: String

    public init(appGroupId: String, extensionBundleId: String) {
        self.appGroupId = appGroupId
        self.extensionBundleId = extensionBundleId
    }

    /// Resolves [config] or the host app Info.plist.
    public static func resolve(_ config: ScreenShareConfig?) throws -> ScreenShareConfig {
        if let config {
            guard !config.appGroupId.isEmpty, !config.extensionBundleId.isEmpty else {
                throw ScreenShareConfigError.missingValues
            }
            return config
        }
        let info = Bundle.main.infoDictionary ?? [:]
        let appGroupId = info["RTCAppGroupIdentifier"] as? String ?? ""
        let extensionBundleId = info["RTCScreenSharingExtension"] as? String ?? ""
        guard !appGroupId.isEmpty, !extensionBundleId.isEmpty else {
            throw ScreenShareConfigError.missingInfoPlist
        }
        return ScreenShareConfig(appGroupId: appGroupId, extensionBundleId: extensionBundleId)
    }
}

public enum ScreenShareConfigError: LocalizedError, Equatable {
    case missingValues
    case missingInfoPlist

    public var errorDescription: String? {
        switch self {
        case .missingValues:
            return "ScreenShareConfig needs a non-empty appGroupId and extensionBundleId"
        case .missingInfoPlist:
            return "Set ScreenShareConfig, or add RTCAppGroupIdentifier and RTCScreenSharingExtension to Info.plist"
        }
    }
}
