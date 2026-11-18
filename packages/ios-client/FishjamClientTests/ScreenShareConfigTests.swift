import XCTest
@testable import FishjamClient

final class ScreenShareConfigTests: XCTestCase {
    func testResolveUsesProvidedConfig() throws {
        let config = ScreenShareConfig(
            appGroupId: "group.io.fishjam.example",
            extensionBundleId: "io.fishjam.example.ScreenBroadcastExtension"
        )
        let resolved = try ScreenShareConfig.resolve(config)
        XCTAssertEqual(resolved, config)
    }

    func testResolveRejectsEmptyValues() {
        let config = ScreenShareConfig(appGroupId: "", extensionBundleId: "ext")
        XCTAssertThrowsError(try ScreenShareConfig.resolve(config)) { error in
            XCTAssertEqual(error as? ScreenShareConfigError, .missingValues)
        }
    }

    func testResolveFallsBackToInfoPlistOrFails() {
        // The test host has no RTC* keys, so resolve(nil) must fail clearly.
        XCTAssertThrowsError(try ScreenShareConfig.resolve(nil)) { error in
            XCTAssertEqual(error as? ScreenShareConfigError, .missingInfoPlist)
        }
    }
}
