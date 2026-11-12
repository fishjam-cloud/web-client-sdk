package io.fishjam.client

import android.content.Context
import io.fishjam.client.webrtcutils.H264AndSoftwareVideoDecoderFactory
import io.fishjam.client.webrtcutils.H264AndSoftwareVideoEncoderFactory
import org.webrtc.PeerConnectionFactory
import org.webrtc.SoftwareVideoDecoderFactory
import org.webrtc.SoftwareVideoEncoderFactory
import org.webrtc.VideoDecoderFactory
import org.webrtc.VideoEncoderFactory
import org.webrtc.audio.JavaAudioDeviceModule

/** The factory used by rooms and by the livestream viewer: same codecs, same shared EGL context. */
internal fun createPeerConnectionFactory(context: Context): PeerConnectionFactory {
    val appContext = context.applicationContext
    PeerConnectionFactory.initialize(
        PeerConnectionFactory.InitializationOptions.builder(appContext).createInitializationOptions()
    )
    val eglContext = SharedEgl.base.eglBaseContext
    val encoder: VideoEncoderFactory
    val decoder: VideoDecoderFactory
    if (eglContext != null) {
        encoder = H264AndSoftwareVideoEncoderFactory(eglContext)
        decoder = H264AndSoftwareVideoDecoderFactory(eglContext)
    } else {
        encoder = SoftwareVideoEncoderFactory()
        decoder = SoftwareVideoDecoderFactory()
    }
    val audioDevice = JavaAudioDeviceModule.builder(appContext).createAudioDeviceModule()
    val created =
        PeerConnectionFactory
            .builder()
            .setAudioDeviceModule(audioDevice)
            .setVideoEncoderFactory(encoder)
            .setVideoDecoderFactory(decoder)
            .createPeerConnectionFactory()
    audioDevice.release()
    return created
}
