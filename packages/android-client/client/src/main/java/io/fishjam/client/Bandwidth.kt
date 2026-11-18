package io.fishjam.client

import fishjam.sdk.SdkApi

/** One simulcast layer. Low is the smallest picture, high is the full picture. */
enum class Variant {
    Low,
    Medium,
    High
}

/**
 * App limits for outgoing video, in kbps (1 kbps = 1024 bps).
 * `0` or a negative value uses the cap. A value above the cap is clamped.
 * The caps are 1500 kbps for one encoding, and 150 / 500 / 1500 for the
 * low / medium / high layers.
 */
data class BandwidthLimits(
    val singleStreamKbps: Int = 1500,
    val lowKbps: Int = 150,
    val mediumKbps: Int = 500,
    val highKbps: Int = 1500
) {
    internal fun toProto(): SdkApi.BandwidthLimits = SdkApi.BandwidthLimits
        .newBuilder()
        .setSingleStreamKbps(nonNegativeKbps(singleStreamKbps))
        .setLowKbps(nonNegativeKbps(lowKbps))
        .setMediumKbps(nonNegativeKbps(mediumKbps))
        .setHighKbps(nonNegativeKbps(highKbps))
        .build()
}

/** Which camera layers to send. Other video tracks always send one encoding. */
enum class VideoSendMode {
    Simulcast,
    Single
}

/**
 * Camera layers to send. [VideoSendMode.Simulcast] with an empty
 * [sentQualities] list sends low, medium, and high. A layer left out of the
 * list stays in the offer with `active = false`.
 */
data class VideoConfig(
    val mode: VideoSendMode = VideoSendMode.Simulcast,
    val sentQualities: List<Variant> = listOf(Variant.Low, Variant.Medium, Variant.High)
) {
    internal fun toProto(): SdkApi.VideoConfig {
        val builder = SdkApi.VideoConfig.newBuilder()
        when (mode) {
            VideoSendMode.Simulcast -> {
                builder.mode = SdkApi.VideoSendMode.VIDEO_SEND_MODE_SIMULCAST
                sentQualities.forEach { variant -> builder.addSentQualities(variant.toProto()) }
            }
            VideoSendMode.Single -> builder.mode = SdkApi.VideoSendMode.VIDEO_SEND_MODE_SINGLE
        }
        return builder.build()
    }
}

/** One number for the whole track, or one number per simulcast layer. `0` means the cap. */
sealed class BandwidthLimit {
    data class Single(val kbps: Int) : BandwidthLimit()

    data class Layers(val lowKbps: Int, val mediumKbps: Int, val highKbps: Int) : BandwidthLimit()
}

/** Which simulcast layers a track is allowed to use. */
data class SimulcastConfig(
    val enabled: Boolean,
    val enabledVariants: List<Variant>,
    val disabledVariants: List<Variant>
) {
    companion object {
        val Disabled = SimulcastConfig(enabled = false, enabledVariants = emptyList(), disabledVariants = emptyList())
    }
}

internal fun Variant.toProto(): SdkApi.Variant = when (this) {
    Variant.Low -> SdkApi.Variant.VARIANT_LOW
    Variant.Medium -> SdkApi.Variant.VARIANT_MEDIUM
    Variant.High -> SdkApi.Variant.VARIANT_HIGH
}

internal fun variantOf(proto: SdkApi.Variant): Variant? = when (proto) {
    SdkApi.Variant.VARIANT_LOW -> Variant.Low
    SdkApi.Variant.VARIANT_MEDIUM -> Variant.Medium
    SdkApi.Variant.VARIANT_HIGH -> Variant.High
    else -> null
}

internal fun simulcastOf(proto: SdkApi.SimulcastConfig): SimulcastConfig = SimulcastConfig(
    enabled = proto.enabled,
    enabledVariants = proto.enabledVariantsList.mapNotNull(::variantOf),
    disabledVariants = proto.disabledVariantsList.mapNotNull(::variantOf)
)

internal fun BandwidthLimit.toRequest(trackId: String): SdkApi.SetTrackBandwidth {
    val builder = SdkApi.SetTrackBandwidth.newBuilder().setTrackId(trackId)
    when (this) {
        is BandwidthLimit.Single -> builder.setSingleKbps(nonNegativeKbps(kbps))
        is BandwidthLimit.Layers -> {
            builder.addLayers(layerBandwidth(Variant.Low, lowKbps))
            builder.addLayers(layerBandwidth(Variant.Medium, mediumKbps))
            builder.addLayers(layerBandwidth(Variant.High, highKbps))
        }
    }
    return builder.build()
}

private fun layerBandwidth(variant: Variant, kbps: Int): SdkApi.LayerBandwidth = SdkApi.LayerBandwidth
    .newBuilder()
    .setVariant(variant.toProto())
    .setKbps(nonNegativeKbps(kbps))
    .build()

private fun nonNegativeKbps(kbps: Int): Int = kbps.coerceAtLeast(0)
