@testable import FishjamClient
import AVFoundation
import XCTest

final class AudioOutputTests: XCTestCase {
    func testMapsPorts() {
        XCTAssertEqual(audioDeviceType(for: .builtInSpeaker), .speaker)
        XCTAssertEqual(audioDeviceType(for: .builtInReceiver), .earpiece)
        XCTAssertEqual(audioDeviceType(for: .bluetoothHFP), .bluetooth)
        XCTAssertEqual(audioDeviceType(for: .headphones), .wiredHeadset)
        XCTAssertEqual(audioDeviceType(for: .HDMI), .hdmi)
        XCTAssertEqual(audioDeviceType(for: .airPlay), .airplay)
        XCTAssertEqual(audioDeviceType(for: .carAudio), .carAudio)
        XCTAssertEqual(audioDeviceType(for: .usbAudio), .usb)
        XCTAssertEqual(audioDeviceType(for: .lineOut), .lineOut)
        XCTAssertEqual(audioDeviceType(for: .builtInMic), .unknown)
        XCTAssertEqual(audioDeviceNativeType(for: .HDMI), "HDMI")
        XCTAssertEqual(audioDeviceNativeType(for: .carAudio), "carAudio")
        XCTAssertEqual(audioDeviceNativeType(for: .airPlay), "airPlay")
        XCTAssertEqual(audioDeviceId(port: .builtInSpeaker, uid: "ignored"), "speaker")
        XCTAssertEqual(audioDeviceId(port: .builtInReceiver, uid: "ignored"), "receiver")
        XCTAssertEqual(audioDeviceId(port: .airPlay, uid: "airplay-uid"), "airplay-uid")
    }

    func testEntersOnConnectedAndLeavesWhenTheRoomEnds() {
        XCTAssertEqual(communicationModeChange(from: .idle, to: .connected), true)
        XCTAssertNil(communicationModeChange(from: .connecting, to: .idle))
        XCTAssertNil(communicationModeChange(from: .connected, to: .connected))
        XCTAssertEqual(communicationModeChange(from: .connected, to: .idle), false)
        let failure = ConnectionFailure(message: "lost", authReason: nil, joinReason: nil)
        XCTAssertEqual(communicationModeChange(from: .connected, to: .error(failure)), false)
    }
}
