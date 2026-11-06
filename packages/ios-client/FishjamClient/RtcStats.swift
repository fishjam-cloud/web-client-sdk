import Foundation
import WebRTC

public struct RtcStats: Equatable {
    public let id: String
    public let type: String
    public let timestampUs: Int64
    public let members: [String: RtcStatMember]

    public init(id: String, type: String, timestampUs: Int64, members: [String: RtcStatMember]) {
        self.id = id
        self.type = type
        self.timestampUs = timestampUs
        self.members = members
    }
}

public enum RtcStatMember: Equatable {
    case bool(Bool)
    case number(Double)
    case text(String)
}

/// Outgoing bandwidth estimate in bits per second. `0` when the report has none.
public func outgoingBitrateBps(_ stats: [RtcStats]) -> Int64 {
    let pairs = stats.filter { $0.type == "candidate-pair" }
    let nominated = pairs.first {
        $0.bool("nominated") == true && $0.number("availableOutgoingBitrate") != nil
    }
    let chosen = nominated ?? pairs.first { $0.number("availableOutgoingBitrate") != nil }
    guard let bitrate = chosen?.number("availableOutgoingBitrate") else { return 0 }
    return Int64(bitrate)
}

/// `audioLevel` of the first audio `media-source` report, from 0.0 to 1.0.
public func audioLevel(_ stats: [RtcStats]) -> Double? {
    stats.first {
        $0.type == "media-source" && $0.text("kind") == "audio" && $0.number("audioLevel") != nil
    }?.number("audioLevel")
}

/// `bytesReceived` of the video `inbound-rtp` report.
public func inboundVideoBytesReceived(_ stats: [RtcStats]) -> Double? {
    stats.first {
        $0.type == "inbound-rtp" && $0.text("kind") == "video" && $0.number("bytesReceived") != nil
    }?.number("bytesReceived")
}

/// Kilobits per second, where one kilobit is 1024 bits.
/// `nil` when the interval is empty or the counter went backwards.
public func receivedKilobitsPerSecond(previousBytes: Double, bytes: Double, elapsedSeconds: Double) -> Int64? {
    guard elapsedSeconds > 0, bytes >= previousBytes else { return nil }
    return Int64((bytes - previousBytes) * 8 / elapsedSeconds / 1024)
}

func rtcStats(from report: RTCStatisticsReport) -> [RtcStats] {
    report.statistics.values.map { stat in
        var members: [String: RtcStatMember] = [:]
        for (key, value) in stat.values {
            if let member = rtcStatMember(value) {
                members[key] = member
            }
        }
        return RtcStats(
            id: stat.id,
            type: stat.type,
            timestampUs: Int64(stat.timestamp_us),
            members: members
        )
    }
}

private func rtcStatMember(_ value: NSObject) -> RtcStatMember? {
    if let text = value as? String {
        return .text(text)
    }
    if let number = value as? NSNumber {
        if CFGetTypeID(number) == CFBooleanGetTypeID() {
            return .bool(number.boolValue)
        }
        return .number(number.doubleValue)
    }
    return nil
}

private extension RtcStats {
    func number(_ key: String) -> Double? {
        if case let .number(value) = members[key] { return value }
        return nil
    }

    func text(_ key: String) -> String? {
        if case let .text(value) = members[key] { return value }
        return nil
    }

    func bool(_ key: String) -> Bool? {
        if case let .bool(value) = members[key] { return value }
        return nil
    }
}
