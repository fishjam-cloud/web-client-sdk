package io.fishjam.client

import fishjam.sdk.SdkApi

/** Thrown when a video track is added in an audio-only room. */
class TrackTypeError : Exception(
    "Attempted to add video track to audio-only room. " +
        "Please refer to the docs at https://docs.fishjam.io/audio-calls"
)

/** What [FishjamClient.startCamera] does once the room type is known. */
internal enum class CameraStart {
    /** Open the camera, then publish when the peer is connected. */
    OpenAndPublish,

    /** The peer is connected to an audio-only room. Do not open the camera. */
    RejectVideo
}

internal fun cameraStart(connected: Boolean, audioOnly: Boolean): CameraStart =
    if (connected && audioOnly) CameraStart.RejectVideo else CameraStart.OpenAndPublish

internal fun isTrackTypeError(error: SdkApi.Error): Boolean =
    error.callErrorReason == SdkApi.CallErrorReason.CALL_ERROR_REASON_TRACK_TYPE

internal fun exceptionForCallError(error: SdkApi.Error): Exception =
    if (isTrackTypeError(error)) TrackTypeError() else IllegalStateException(error.message)
