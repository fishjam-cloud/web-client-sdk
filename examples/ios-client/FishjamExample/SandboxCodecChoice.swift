import FishjamClient

enum SandboxCodecChoice: String, CaseIterable, Identifiable {
    case serverDefault = "Default"
    case vp8 = "VP8"
    case h264 = "H264"

    var id: String { rawValue }

    var codec: SandboxVideoCodec? {
        switch self {
        case .serverDefault:
            return nil
        case .vp8:
            return .vp8
        case .h264:
            return .h264
        }
    }
}
