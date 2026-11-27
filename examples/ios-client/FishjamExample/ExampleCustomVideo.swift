import FishjamClient
import SwiftUI

extension JoinView {
    @ViewBuilder
    var customLocalVideos: some View {
        if let video = localCustomVideo {
            VideoView(track: video, objectFit: .contain)
                .frame(maxWidth: .infinity)
                .frame(height: 200)
                .background(Color.black)
                .accessibilityIdentifier("local-custom-video")
        }
        if let video = localCustomClock {
            VideoView(track: video, objectFit: .contain)
                .frame(maxWidth: .infinity)
                .frame(height: 200)
                .background(Color.black)
                .accessibilityIdentifier("local-custom-clock")
        }
    }

    @ViewBuilder
    func customRemoteVideos(_ peer: PeerWithTracks) -> some View {
        ForEach(Array(peer.customVideoTracks.enumerated()), id: \.element.trackId) { index, track in
            if let video = track.videoTrack {
                VideoView(track: video, objectFit: .contain)
                    .frame(maxWidth: .infinity)
                    .frame(height: 200)
                    .background(Color.black)
                    .accessibilityIdentifier("remote-custom-\(index)")
            }
        }
    }

    var videoFileButton: some View {
        prominentButton(videoFile == nil ? "Video off" : "Video on", identifier: "custom-video") {
            notice = ""
            if let videoFile {
                videoFile.stop()
                self.videoFile = nil
                localCustomVideo = nil
                Task { try? await client.setCustomSource(sourceId: "video", track: nil) }
                return
            }
            guard let url = Bundle.main.url(forResource: "sample", withExtension: "mp4") else {
                notice = "sample video missing"
                return
            }
            let created = client.createCustomVideoTrack()
            let source = VideoFileSource(track: created)
            source.start(url: url)
            videoFile = source
            localCustomVideo = created.track
            Task {
                do {
                    try await client.setCustomSource(sourceId: "video", track: created.track)
                } catch {
                    notice = error.localizedDescription
                }
            }
        }
    }

    var clockButton: some View {
        prominentButton(clockSource == nil ? "Clock off" : "Clock on", identifier: "custom-clock") {
            notice = ""
            if let clockSource {
                clockSource.stop()
                self.clockSource = nil
                localCustomClock = nil
                Task { try? await client.setCustomSource(sourceId: "clock", track: nil) }
                return
            }
            do {
                let pool = try client.createCustomVideoBufferPool(width: 640, height: 360, poolSize: 3)
                let created = try client.createCustomVideoTrack(pool: pool)
                let source = ClockSource(pool: pool, track: created)
                source.start()
                clockSource = source
                localCustomClock = created.track
                Task {
                    do {
                        try await client.setCustomSource(sourceId: "clock", track: created.track)
                    } catch {
                        notice = error.localizedDescription
                    }
                }
            } catch {
                notice = error.localizedDescription
            }
        }
    }
}
