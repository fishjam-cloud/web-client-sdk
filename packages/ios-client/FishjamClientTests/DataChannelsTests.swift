@testable import FishjamClient
import XCTest

private final class FakeLink: DataChannelLink {
    let type: DataChannelType
    var sent: [Data] = []
    var closed = false

    init(type: DataChannelType) {
        self.type = type
    }

    func send(_ data: Data) -> Bool {
        sent.append(data)
        return true
    }

    func close() {
        closed = true
    }
}

final class DataChannelsTests: XCTestCase {
    private var links: [FakeLink] = []

    private func makeChannels() -> DataChannels {
        DataChannels(
            encode: { Data([9]) + $0 },
            decode: { bytes in bytes.first == 9 ? Data(bytes.dropFirst()) : nil }
        )
    }

    private func createLinks(_ channels: DataChannels) {
        channels.createMissing { type in
            let link = FakeLink(type: type)
            self.links.append(link)
            return link
        }
    }

    private func openAll(_ channels: DataChannels) {
        links.forEach { channels.onOpen($0) }
    }

    private func link(_ type: DataChannelType) -> FakeLink {
        links.last { $0.type == type }!
    }

    func testStartSetsLoadingAndIsIgnoredWhileLoadingOrReady() {
        let channels = makeChannels()

        XCTAssertTrue(channels.start())
        XCTAssertTrue(channels.state.loading)
        XCTAssertFalse(channels.start())

        createLinks(channels)
        openAll(channels)
        XCTAssertFalse(channels.start())
    }

    func testChannelsAreCreatedOnlyAfterStartAndOnlyOnce() {
        let channels = makeChannels()
        createLinks(channels)
        XCTAssertTrue(links.isEmpty)

        _ = channels.start()
        createLinks(channels)
        createLinks(channels)

        XCTAssertEqual(links.map(\.type), [.reliable, .lossy])
    }

    func testReadyOnlyWhenBothChannelsOpen() {
        let channels = makeChannels()
        _ = channels.start()
        createLinks(channels)

        channels.onOpen(link(.reliable))
        XCTAssertFalse(channels.state.ready)

        channels.onOpen(link(.lossy))
        XCTAssertTrue(channels.state.ready)
        XCTAssertFalse(channels.state.loading)
        XCTAssertNil(channels.state.error)
    }

    func testChannelClosingBeforeOpenIsAnError() {
        let channels = makeChannels()
        _ = channels.start()
        createLinks(channels)

        channels.onClosed(link(.lossy))

        XCTAssertFalse(channels.state.loading)
        XCTAssertFalse(channels.state.ready)
        XCTAssertEqual(channels.state.error?.localizedDescription, "Data channel lossy closed before opening")
        XCTAssertTrue(links.allSatisfy(\.closed))
        XCTAssertTrue(channels.start())
    }

    func testPublishWrapsPayloadAndPicksTheChannel() throws {
        let channels = makeChannels()
        _ = channels.start()
        createLinks(channels)
        openAll(channels)

        try channels.publish(Data([1, 2]), reliable: false)

        XCTAssertTrue(link(.reliable).sent.isEmpty)
        XCTAssertEqual(link(.lossy).sent, [Data([9, 1, 2])])
    }

    func testPublishBeforeReadyThrows() {
        XCTAssertThrowsError(try makeChannels().publish(Data([1]), reliable: true))
    }

    func testSubscriberAddedBeforeSetupGetsDecodedMessagesOfItsChannelOnly() {
        let channels = makeChannels()
        var received: [Data] = []
        _ = channels.subscribe(reliable: true) { received.append($0) }
        _ = channels.start()
        createLinks(channels)
        openAll(channels)

        channels.onMessage(link(.reliable), Data([9, 7]))
        channels.onMessage(link(.lossy), Data([9, 8]))
        channels.onMessage(link(.reliable), Data([1]))

        XCTAssertEqual(received, [Data([7])])
    }

    func testUnsubscribeStopsDelivery() {
        let channels = makeChannels()
        var received: [Data] = []
        _ = channels.start()
        createLinks(channels)
        openAll(channels)
        let unsubscribe = channels.subscribe(reliable: true) { received.append($0) }

        unsubscribe()
        channels.onMessage(link(.reliable), Data([9, 7]))

        XCTAssertTrue(received.isEmpty)
    }

    func testResetClosesChannelsKeepsSubscribersAndAllowsAnotherStart() {
        let channels = makeChannels()
        var received: [Data] = []
        _ = channels.subscribe(reliable: true) { received.append($0) }
        _ = channels.start()
        createLinks(channels)
        openAll(channels)
        let old = link(.reliable)

        channels.reset()

        XCTAssertFalse(channels.state.ready)
        XCTAssertFalse(channels.state.loading)
        XCTAssertTrue(links.allSatisfy(\.closed))
        channels.onOpen(old)
        XCTAssertFalse(channels.state.ready)

        XCTAssertTrue(channels.start())
        createLinks(channels)
        links.dropFirst(2).forEach { channels.onOpen($0) }
        channels.onMessage(link(.reliable), Data([9, 5]))
        XCTAssertTrue(channels.state.ready)
        XCTAssertEqual(received, [Data([5])])
    }

    func testCloseAfterReadyClearsReady() {
        let channels = makeChannels()
        _ = channels.start()
        createLinks(channels)
        openAll(channels)

        channels.onClosed(link(.reliable))

        XCTAssertFalse(channels.state.ready)
    }

    func testEveryStateChangeIsReported() {
        var reported: [DataChannelState] = []
        let channels = DataChannels(encode: { $0 }, decode: { $0 }, onChange: { reported.append($0) })

        _ = channels.start()
        createLinks(channels)
        openAll(channels)

        XCTAssertEqual(reported.map(\.loading), [true, false])
        XCTAssertEqual(reported.map(\.ready), [false, true])
    }
}
