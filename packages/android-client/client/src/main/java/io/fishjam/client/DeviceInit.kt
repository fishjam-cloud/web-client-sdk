package io.fishjam.client

/** A camera or microphone failure. */
enum class DeviceError {
    NotAllowed,
    NotFound,
    Unknown
}

/** Outcome of [FishjamClient.initializeDevices]. */
enum class InitializeDevicesStatus {
    Initialized,
    Failed,
    InitializedWithErrors,
    AlreadyInitialized
}

/** Per-device errors from [FishjamClient.initializeDevices]. Null means that device started or was not requested. */
data class DeviceErrors(
    val audio: DeviceError?,
    val video: DeviceError?
)

data class InitializeDevicesResult(
    val status: InitializeDevicesStatus,
    val errors: DeviceErrors?
)

internal fun initializeDevicesResult(
    videoRequested: Boolean,
    audioRequested: Boolean,
    videoError: DeviceError?,
    audioError: DeviceError?
): InitializeDevicesResult {
    val video = if (videoRequested) videoError else null
    val audio = if (audioRequested) audioError else null
    val videoFailed = videoRequested && video != null
    val audioFailed = audioRequested && audio != null
    val anyFailed = videoFailed || audioFailed
    val anyStarted = (videoRequested && video == null) || (audioRequested && audio == null)
    val status =
        when {
            anyFailed && anyStarted -> InitializeDevicesStatus.InitializedWithErrors
            anyFailed -> InitializeDevicesStatus.Failed
            else -> InitializeDevicesStatus.Initialized
        }
    val errors = if (status == InitializeDevicesStatus.Initialized) null else DeviceErrors(audio = audio, video = video)
    return InitializeDevicesResult(status = status, errors = errors)
}

/** The call was interrupted, so the requested devices are reported as failed and the next call can try again. */
internal fun interruptedInitializeDevicesResult(
    videoRequested: Boolean,
    audioRequested: Boolean
): InitializeDevicesResult = InitializeDevicesResult(
    status = InitializeDevicesStatus.Failed,
    errors = DeviceErrors(
        audio = if (audioRequested) DeviceError.Unknown else null,
        video = if (videoRequested) DeviceError.Unknown else null
    )
)

internal fun deviceErrorForCameraFailure(error: Throwable): DeviceError = when (error) {
    is SecurityException -> DeviceError.NotAllowed
    is CameraNotFoundException -> DeviceError.NotFound
    else -> DeviceError.Unknown
}

internal fun deviceErrorForMicrophoneFailure(error: Throwable): DeviceError = when (error) {
    is SecurityException -> DeviceError.NotAllowed
    else -> DeviceError.Unknown
}
