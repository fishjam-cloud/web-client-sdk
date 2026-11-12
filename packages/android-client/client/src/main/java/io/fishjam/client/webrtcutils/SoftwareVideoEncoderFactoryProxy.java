// Copied from react-native-webrtc (MIT, Copyright (c) 2017-present React Native WebRTC Community).
// Changed: package name, and the androidx.annotation.Nullable markers were removed.
package io.fishjam.client.webrtcutils;


import org.webrtc.SoftwareVideoEncoderFactory;
import org.webrtc.VideoCodecInfo;
import org.webrtc.VideoEncoder;
import org.webrtc.VideoEncoderFactory;

/**
 * Helper proxy factory for the software codecs. Starting with M111 SoftwareVideoEncoderFactory
 * cannot be instantiated before the PeerConnectionFactory has been initialized because it
 * relies on JNI. This proxy factory lazy initializes it.
 */
public class SoftwareVideoEncoderFactoryProxy implements VideoEncoderFactory {
    private VideoEncoderFactory factory;

    private synchronized VideoEncoderFactory getFactory() {
        if (factory == null) {
            factory = new SoftwareVideoEncoderFactory();
        }

        return factory;
    }

    @Override
    public VideoEncoder createEncoder(VideoCodecInfo videoCodecInfo) {
        return getFactory().createEncoder(videoCodecInfo);
    }

    @Override
    public VideoCodecInfo[] getSupportedCodecs() {
        return getFactory().getSupportedCodecs();
    }
}
