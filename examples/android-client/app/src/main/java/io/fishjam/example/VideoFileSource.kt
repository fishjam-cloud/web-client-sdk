package io.fishjam.example

import android.content.Context
import android.media.ImageReader
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import androidx.annotation.RequiresApi
import io.fishjam.client.ForwardVideoTrack

/**
 * Decodes a bundled video onto an [ImageReader] and forwards each frame.
 * The decoder owns the buffers. Requires API 28.
 */
@RequiresApi(28)
class VideoFileSource(
    context: Context,
    private val track: ForwardVideoTrack
) {
    private val asset = context.applicationContext.assets
    private val thread = HandlerThread("fishjam-video-file")
    private val handler: Handler
    private var extractor: MediaExtractor? = null
    private var codec: MediaCodec? = null
    private var reader: ImageReader? = null
    private var running = false

    init {
        thread.start()
        handler = Handler(thread.looper)
    }

    fun start() {
        running = true
        handler.post { startOnThread() }
    }

    fun stop() {
        if (!running && extractor == null) return
        running = false
        handler.post {
            releaseDecoder()
            thread.quitSafely()
        }
        track.stop()
    }

    private fun startOnThread() {
        val opened = asset.openFd("sample.mp4")
        val extractor = MediaExtractor()
        extractor.setDataSource(opened.fileDescriptor, opened.startOffset, opened.length)
        opened.close()
        val trackIndex = (0 until extractor.trackCount).firstOrNull { index ->
            extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
        } ?: run {
            extractor.release()
            return
        }
        extractor.selectTrack(trackIndex)
        val format = extractor.getTrackFormat(trackIndex)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: return
        val reader = newReader(format.getInteger(MediaFormat.KEY_WIDTH), format.getInteger(MediaFormat.KEY_HEIGHT))
        reader.setOnImageAvailableListener({ imageReader -> onImage(imageReader) }, handler)
        val codec = MediaCodec.createDecoderByType(mime)
        codec.configure(format, reader.surface, null, 0)
        codec.start()
        this.extractor = extractor
        this.reader = reader
        this.codec = codec
        pump()
    }

    private fun newReader(width: Int, height: Int): ImageReader {
        if (Build.VERSION.SDK_INT >= 29) {
            return ImageReader.newInstance(
                width,
                height,
                android.graphics.ImageFormat.PRIVATE,
                3,
                android.hardware.HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE
            )
        }
        return ImageReader.newInstance(width, height, android.graphics.ImageFormat.PRIVATE, 3)
    }

    private fun onImage(imageReader: ImageReader) {
        val image = imageReader.acquireLatestImage() ?: return
        try {
            if (!running) return
            val buffer = image.hardwareBuffer ?: return
            try {
                track.forwardFrame(buffer)
            } finally {
                buffer.close()
            }
        } finally {
            image.close()
        }
    }

    private fun pump() {
        val codec = codec ?: return
        val extractor = extractor ?: return
        if (!running) return
        val inputIndex = codec.dequeueInputBuffer(0)
        if (inputIndex >= 0) {
            val input = codec.getInputBuffer(inputIndex)
            val size = if (input == null) -1 else extractor.readSampleData(input, 0)
            if (size < 0) {
                codec.flush()
                extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
            } else {
                codec.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime, 0)
                extractor.advance()
            }
        }
        val info = MediaCodec.BufferInfo()
        val outputIndex = codec.dequeueOutputBuffer(info, 0)
        if (outputIndex >= 0) {
            codec.releaseOutputBuffer(outputIndex, true)
        }
        if (running) handler.post { pump() }
    }

    private fun releaseDecoder() {
        runCatching { codec?.stop() }
        runCatching { codec?.release() }
        codec = null
        runCatching { extractor?.release() }
        extractor = null
        val surface: Surface? = reader?.surface
        runCatching { reader?.close() }
        runCatching { surface?.release() }
        reader = null
    }
}
