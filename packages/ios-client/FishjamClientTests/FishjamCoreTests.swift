@testable import FishjamClient
import XCTest

final class FishjamCoreTests: XCTestCase {
    func testAddCallsFishjamCore() {
        XCTAssertEqual(FishjamCoreBridge.add(a: 2, b: 3), 5)
        XCTAssertEqual(FishjamCoreBridge.add(a: 2, b: -3), -1)
    }
}
