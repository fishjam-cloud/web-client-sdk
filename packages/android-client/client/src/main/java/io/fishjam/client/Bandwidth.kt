package io.fishjam.client

import uniffi.fishjam_core.CoreBandwidthLimits
import uniffi.fishjam_core.CoreLayerBandwidth
import uniffi.fishjam_core.CoreSimulcastConfig
import uniffi.fishjam_core.CoreVariant
import uniffi.fishjam_core.CoreVideoConfig
import uniffi.fishjam_core.CoreVideoSendMode

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
 * [singleStreamKbps] applies to a non-simulcast video track other than screen
 * share. Screen share starts at the 1500 kbps cap.
 */
data class BandwidthLimits(
    val singleStreamKbps: Int = 1500,
    val lowKbps: Int = 150,
    val mediumKbps: Int = 500,
    val highKbps: Int = 1500
) {
    internal fun toCore(): CoreBandwidthLimits = CoreBandwidthLimits(
        singleStreamKbps = nonNegativeKbps(singleStreamKbps),
        lowKbps = nonNegativeKbps(lowKbps),
        mediumKbps = nonNegativeKbps(mediumKbps),
        highKbps = nonNegativeKbps(highKbps)
    )
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
    internal fun toCore(): CoreVideoConfig = when (mode) {
        VideoSendMode.Simulcast -> CoreVideoConfig(CoreVideoSendMode.SIMULCAST, sentQualities.map { it.toCore() })
        VideoSendMode.Single -> CoreVideoConfig(CoreVideoSendMode.SINGLE, emptyList())
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

internal fun Variant.toCore(): CoreVariant = when (this) {
    Variant.Low -> CoreVariant.LOW
    Variant.Medium -> CoreVariant.MEDIUM
    Variant.High -> CoreVariant.HIGH
}

internal fun variantOf(core: CoreVariant): Variant? = when (core) {
    CoreVariant.LOW -> Variant.Low
    CoreVariant.MEDIUM -> Variant.Medium
    CoreVariant.HIGH -> Variant.High
    CoreVariant.UNSPECIFIED -> null
}

internal fun simulcastOf(core: CoreSimulcastConfig): SimulcastConfig = SimulcastConfig(
    enabled = core.enabled,
    enabledVariants = core.enabledVariants.mapNotNull(::variantOf),
    disabledVariants = core.disabledVariants.mapNotNull(::variantOf)
)

internal val BandwidthLimit.singleKbps: UInt?
    get() = (this as? BandwidthLimit.Single)?.let { nonNegativeKbps(it.kbps) }

internal val BandwidthLimit.layers: List<CoreLayerBandwidth>
    get() = when (this) {
        is BandwidthLimit.Single -> emptyList()
        is BandwidthLimit.Layers -> listOf(
            CoreLayerBandwidth(CoreVariant.LOW, nonNegativeKbps(lowKbps)),
            CoreLayerBandwidth(CoreVariant.MEDIUM, nonNegativeKbps(mediumKbps)),
            CoreLayerBandwidth(CoreVariant.HIGH, nonNegativeKbps(highKbps))
        )
    }

internal fun nonNegativeKbps(kbps: Int): UInt = kbps.coerceAtLeast(0).toUInt()
