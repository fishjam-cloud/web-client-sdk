import FishjamCore
import Foundation

/// Temporary check that the Swift code reaches fishjam-core through the C ABI.
public enum FishjamCoreBridge {
    public static func add(a: Int32, b: Int32) -> Int32 {
        guard let client = fishjam_client_new(nil, 0, nil, nil) else {
            fatalError("fishjam_client_new returned null")
        }
        defer { fishjam_client_free(client) }

        let request = Fishjam_Sdk_SdkRequest.with {
            $0.add = Fishjam_Sdk_AddRequest.with {
                $0.a = a
                $0.b = b
            }
        }
        // swiftlint:disable:next force_try
        let bytes = try! request.serializedData()

        var out = FishjamBuf(data: nil, len: 0)
        let code = bytes.withUnsafeBytes { raw in
            fishjam_client_call(client, raw.bindMemory(to: UInt8.self).baseAddress, bytes.count, &out)
        }
        defer { fishjam_buf_free(out) }

        let payload = out.data.map { Data(bytes: $0, count: out.len) } ?? Data()
        guard code == 0, let response = try? Fishjam_Sdk_SdkResponse(serializedBytes: payload),
              case let .add(result)? = response.content
        else {
            fatalError("fishjam_client_call failed with code \(code)")
        }
        return result.sum
    }
}
