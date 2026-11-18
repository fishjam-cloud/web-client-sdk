import XCTest
@testable import FishjamClient

final class ScreenCaptureMessageTests: XCTestCase {
    func testAppendReturnsMinusOneUntilHeaderIsComplete() {
        let message = ScreenCaptureMessage()
        var bytes: [UInt8] = Array("HTTP/1.1 200 OK\r\nCont".utf8)
        let missing = bytes.withUnsafeMutableBufferPointer { buffer in
            message.append(bytes: buffer.baseAddress!, length: buffer.count)
        }
        XCTAssertEqual(missing, -1)
        XCTAssertNil(message.imageBuffer)
    }

    func testAppendReportsMissingBodyBytesAfterHeader() {
        let message = ScreenCaptureMessage()
        let header = """
        HTTP/1.1 200 OK\r
        Content-Length: 10\r
        Buffer-Width: 2\r
        Buffer-Height: 2\r
        Buffer-Orientation: 1\r
        \r

        """
        var bytes = Array(header.utf8)
        let missing = bytes.withUnsafeMutableBufferPointer { buffer in
            message.append(bytes: buffer.baseAddress!, length: buffer.count)
        }
        XCTAssertEqual(missing, 10)
    }
}
