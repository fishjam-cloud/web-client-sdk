import { Variant } from "@fishjam-cloud/ts-client";
const ALL_VARIANTS = [Variant.VARIANT_LOW, Variant.VARIANT_MEDIUM, Variant.VARIANT_HIGH];
const getDisabledEncodings = (enabledVariants) => ALL_VARIANTS.filter((variant) => !enabledVariants.includes(variant));
export const getConfigAndBandwidthFromProps = (encodings, bandwidthLimits) => {
    if (!encodings)
        return [bandwidthLimits.singleStream, undefined];
    const config = {
        enabled: true,
        enabledVariants: encodings,
        disabledVariants: getDisabledEncodings(encodings),
    };
    const variantEntries = Object.entries(bandwidthLimits.simulcast).map(([key, value]) => [Number(key), value]);
    const bandwidth = new Map(variantEntries);
    return [bandwidth, config];
};
function getCertainTypeTracks(stream, type) {
    if (type === "audio")
        return stream.getAudioTracks();
    return stream.getVideoTracks();
}
export function getTrackFromStream(stream, type) {
    return getCertainTypeTracks(stream, type)[0] ?? null;
}
export function stopStream(stream, type) {
    getCertainTypeTracks(stream, type).forEach((track) => {
        track.enabled = false;
        track.stop();
    });
}
