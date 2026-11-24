import AVFoundation
import Foundation
import os.log

/// Plays a North-American ringback tone (440 Hz + 480 Hz, 2 s on / 4 s off) while
/// an outgoing CallKit call is dialing.
final class Dialtone: @unchecked Sendable {
    static let shared = Dialtone()

    private let lock = NSLock()
    private var player: AVAudioPlayer?

    private init() {}

    func play() {
        lock.lock()
        defer { lock.unlock() }
        guard player == nil else { return }
        do {
            let created = try AVAudioPlayer(data: Self.ringbackData)
            created.numberOfLoops = -1
            created.volume = 1
            created.prepareToPlay()
            created.play()
            player = created
        } catch {
            os_log("[Dialtone] Failed to create player: %{public}@", error.localizedDescription)
        }
    }

    func stop() {
        lock.lock()
        defer { lock.unlock() }
        player?.stop()
        player = nil
    }

    /// One loopable cycle of ringback as a 16 kHz mono 16-bit PCM WAV.
    private static let ringbackData: Data = {
        let sampleRate = 16_000.0
        let firstTone = 440.0
        let secondTone = 480.0
        let amp = 0.28
        let onN = Int(sampleRate * 2.0)
        let offN = Int(sampleRate * 4.0)
        let fade = Int(sampleRate * 0.008)
        let total = onN + offN

        var pcm = Data(capacity: total * 2)
        for sampleIndex in 0..<total {
            var sample = 0.0
            if sampleIndex < onN {
                let time = Double(sampleIndex) / sampleRate
                sample = amp * (sin(2 * .pi * firstTone * time) + sin(2 * .pi * secondTone * time)) / 2
                if sampleIndex < fade {
                    sample *= Double(sampleIndex) / Double(fade)
                }
                if sampleIndex > onN - fade {
                    sample *= Double(onN - sampleIndex) / Double(fade)
                }
            }
            let clamped = max(-1.0, min(1.0, sample))
            var value = Int16(clamped * 32767.0)
            withUnsafeBytes(of: &value) { pcm.append(contentsOf: $0) }
        }

        let dataLen = UInt32(pcm.count)
        let sampleRateU = UInt32(sampleRate)
        let channels: UInt16 = 1
        let bitsPerSample: UInt16 = 16
        let byteRate = sampleRateU * UInt32(channels) * UInt32(bitsPerSample) / 8
        let blockAlign = channels * bitsPerSample / 8
        let audioFormat: UInt16 = 1
        let fmtChunkLen: UInt32 = 16
        let riffLen: UInt32 = 36 + dataLen

        var wav = Data()
        wav.append(contentsOf: [0x52, 0x49, 0x46, 0x46]) // RIFF
        withUnsafeBytes(of: riffLen.littleEndian) { wav.append(contentsOf: $0) }
        wav.append(contentsOf: [0x57, 0x41, 0x56, 0x45]) // WAVE
        wav.append(contentsOf: [0x66, 0x6D, 0x74, 0x20]) // fmt
        withUnsafeBytes(of: fmtChunkLen.littleEndian) { wav.append(contentsOf: $0) }
        withUnsafeBytes(of: audioFormat.littleEndian) { wav.append(contentsOf: $0) }
        withUnsafeBytes(of: channels.littleEndian) { wav.append(contentsOf: $0) }
        withUnsafeBytes(of: sampleRateU.littleEndian) { wav.append(contentsOf: $0) }
        withUnsafeBytes(of: byteRate.littleEndian) { wav.append(contentsOf: $0) }
        withUnsafeBytes(of: blockAlign.littleEndian) { wav.append(contentsOf: $0) }
        withUnsafeBytes(of: bitsPerSample.littleEndian) { wav.append(contentsOf: $0) }
        wav.append(contentsOf: [0x64, 0x61, 0x74, 0x61]) // data
        withUnsafeBytes(of: dataLen.littleEndian) { wav.append(contentsOf: $0) }
        wav.append(pcm)
        return wav
    }()
}
