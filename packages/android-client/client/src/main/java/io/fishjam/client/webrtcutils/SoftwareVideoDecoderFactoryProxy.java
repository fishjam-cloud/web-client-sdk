// Copied from react-native-webrtc (MIT, Copyright (c) 2017-present React Native WebRTC Community).
// Changed: package name, and the androidx.annotation.Nullable markers were removed.
package io.fishjam.client.webrtcutils;


import org.webrtc.SoftwareVideoDecoderFactory;
import org.webrtc.VideoCodecInfo;
import org.webrtc.VideoDecoder;
import org.webrtc.VideoDecoderFactory;

/**
 * Helper proxy factory for the software codecs. Starting with M111 SoftwareVideoDecoderFactory
 * cannot be instantiated before the PeerConnectionFactory has been initialized because it
 * relies on JNI. This proxy factory lazy initializes it.
 */
public class SoftwareVideoDecoderFactoryProxy implements VideoDecoderFactory {
    private VideoDecoderFactory factory;

    private synchronized VideoDecoderFactory getFactory() {
        if (factory == null) {
            factory = new SoftwareVideoDecoderFactory();
        }

        return factory;
    }

    @Override
    public VideoDecoder createDecoder(VideoCodecInfo videoCodecInfo) {
        return getFactory().createDecoder(videoCodecInfo);
    }

    @Override
    public VideoCodecInfo[] getSupportedCodecs() {
        return getFactory().getSupportedCodecs();
    }
}
