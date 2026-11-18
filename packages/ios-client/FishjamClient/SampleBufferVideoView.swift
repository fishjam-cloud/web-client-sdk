import Accelerate
import AVFoundation
import UIKit
import WebRTC

/// Draws WebRTC frames with `AVSampleBufferDisplayLayer`, which keeps drawing inside the PiP window.
/// `RTCMTLVideoView` stops drawing there.
final class SampleBufferVideoView: UIView, RTCVideoRenderer {
    override static var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }

    private var displayLayer: AVSampleBufferDisplayLayer {
        // swiftlint:disable:next force_cast
        layer as! AVSampleBufferDisplayLayer
    }

    private let renderLock = NSLock()
    private var rendering = false
    private let converter = I420Converter()
    private var currentRotation: RTCVideoRotation?

    /// Frames are dropped while this is false, so the view costs nothing outside PiP.
    var shouldRender: Bool {
        get {
            renderLock.lock()
            defer { renderLock.unlock() }
            return rendering
        }
        set {
            renderLock.lock()
            rendering = newValue
            renderLock.unlock()
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        displayLayer.videoGravity = .resizeAspectFill
        clipsToBounds = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        currentRotation = nil
    }

    func setSize(_ size: CGSize) {}

    func renderFrame(_ frame: RTCVideoFrame?) {
        guard let frame, shouldRender, let sampleBuffer = sampleBuffer(from: frame) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.enqueue(sampleBuffer, rotation: frame.rotation)
        }
    }

    private func enqueue(_ sampleBuffer: CMSampleBuffer, rotation: RTCVideoRotation) {
        if #available(iOS 17.0, *) {
            let renderer = displayLayer.sampleBufferRenderer
            if renderer.requiresFlushToResumeDecoding { renderer.flush() }
            guard renderer.isReadyForMoreMediaData else { return }
            applyRotation(rotation)
            renderer.enqueue(sampleBuffer)
        } else {
            if displayLayer.requiresFlushToResumeDecoding { displayLayer.flush() }
            guard displayLayer.isReadyForMoreMediaData else { return }
            applyRotation(rotation)
            displayLayer.enqueue(sampleBuffer)
        }
    }

    private func applyRotation(_ rotation: RTCVideoRotation) {
        guard currentRotation != rotation else { return }
        currentRotation = rotation
        let degrees = CGFloat(rotation.rawValue)
        var scale: CGFloat = 1
        if rotation == ._90 || rotation == ._270, bounds.width > 0 {
            scale = bounds.height / bounds.width
        }
        displayLayer.transform = CATransform3DConcat(
            CATransform3DMakeRotation(degrees / 180 * .pi, 0, 0, 1),
            CATransform3DMakeScale(scale, scale, 1)
        )
    }

    private func sampleBuffer(from frame: RTCVideoFrame) -> CMSampleBuffer? {
        let pixelBuffer: CVPixelBuffer
        if let buffer = frame.buffer as? RTCCVPixelBuffer {
            pixelBuffer = buffer.pixelBuffer
        } else {
            guard let converted = converter.pixelBuffer(from: frame.buffer.toI420()) else { return nil }
            pixelBuffer = converted
        }
        var format: CMVideoFormatDescription?
        CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault, imageBuffer: pixelBuffer, formatDescriptionOut: &format
        )
        guard let format else { return nil }
        // RTCVideoFrame time stamps use a 90 kHz clock.
        let time = CMTime(value: CMTimeValue(frame.timeStamp), timescale: 90000)
        var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: time, decodeTimeStamp: time)
        var sampleBuffer: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: format,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        )
        guard let sampleBuffer else { return nil }
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
           CFArrayGetCount(attachments) > 0 {
            let dictionary = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(
                dictionary,
                Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
            )
        }
        return sampleBuffer
    }
}

/// Converts I420 frames to BGRA pixel buffers with vImage. Used from one frame thread at a time.
private final class I420Converter {
    private var conversion: vImage_YpCbCrToARGB?
    private var pool: CVPixelBufferPool?
    private var poolWidth = 0
    private var poolHeight = 0

    func pixelBuffer(from buffer: RTCI420BufferProtocol) -> CVPixelBuffer? {
        guard var info = conversionInfo() else { return nil }
        let width = Int(buffer.width)
        let height = Int(buffer.height)
        if pool == nil || poolWidth != width || poolHeight != height {
            pool = makePool(width: width, height: height)
            poolWidth = width
            poolHeight = height
        }
        guard let pool else { return nil }
        var output: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &output) == kCVReturnSuccess,
              let output else { return nil }

        var yPlane = plane(buffer.dataY, width: width, height: height, stride: buffer.strideY)
        let chromaWidth = Int(buffer.chromaWidth)
        let chromaHeight = Int(buffer.chromaHeight)
        var uPlane = plane(buffer.dataU, width: chromaWidth, height: chromaHeight, stride: buffer.strideU)
        var vPlane = plane(buffer.dataV, width: chromaWidth, height: chromaHeight, stride: buffer.strideV)

        CVPixelBufferLockBaseAddress(output, [])
        defer { CVPixelBufferUnlockBaseAddress(output, []) }
        var destination = vImage_Buffer(
            data: CVPixelBufferGetBaseAddress(output),
            height: vImagePixelCount(height),
            width: vImagePixelCount(width),
            rowBytes: CVPixelBufferGetBytesPerRow(output)
        )
        let bgra: [UInt8] = [3, 2, 1, 0]
        let error = vImageConvert_420Yp8_Cb8_Cr8ToARGB8888(
            &yPlane, &uPlane, &vPlane, &destination, &info, bgra, 255, vImage_Flags(kvImageNoFlags)
        )
        return error == kvImageNoError ? output : nil
    }

    private func plane(_ data: UnsafePointer<UInt8>, width: Int, height: Int, stride: Int32) -> vImage_Buffer {
        vImage_Buffer(
            data: UnsafeMutableRawPointer(mutating: data),
            height: vImagePixelCount(height),
            width: vImagePixelCount(width),
            rowBytes: Int(stride)
        )
    }

    private func conversionInfo() -> vImage_YpCbCrToARGB? {
        if let conversion { return conversion }
        // I420 from WebRTC uses the limited range.
        var range = vImage_YpCbCrPixelRange(
            Yp_bias: 16, CbCr_bias: 128, YpRangeMax: 235, CbCrRangeMax: 240,
            YpMax: 255, YpMin: 0, CbCrMax: 255, CbCrMin: 0
        )
        var info = vImage_YpCbCrToARGB()
        let error = vImageConvert_YpCbCrToARGB_GenerateConversion(
            kvImage_YpCbCrToARGBMatrix_ITU_R_601_4,
            &range,
            &info,
            kvImage420Yp8_Cb8_Cr8,
            kvImageARGB8888,
            vImage_Flags(kvImageNoFlags)
        )
        guard error == kvImageNoError else {
            NSLog("Fishjam PiP: I420 conversion setup failed: %ld", error)
            return nil
        }
        conversion = info
        return info
    }

    private func makePool(width: Int, height: Int) -> CVPixelBufferPool? {
        let attributes: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey: width,
            kCVPixelBufferHeightKey: height,
            kCVPixelBufferIOSurfacePropertiesKey: [CFString: Any]()
        ]
        var created: CVPixelBufferPool?
        CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, attributes as CFDictionary, &created)
        return created
    }
}
