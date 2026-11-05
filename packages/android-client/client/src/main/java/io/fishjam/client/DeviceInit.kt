package io.fishjam.client

/**
 * A camera or microphone failure.
 *
 * [rawValue] is the React Native device error name.
 */
enum class DeviceError(val rawValue: String) {
    NotAllowed("NotAllowedError"),
    NotFound("NotFoundError"),
    Overconstrained("OverconstrainedError"),
    Unhandled("UNHANDLED_ERROR")
}

/**
 * Outcome of [FishjamClient.initializeDevices].
 *
 * [label] is the React Native status string.
 */
enum class InitializeDevicesStatus(val label: String) {
    Initialized("initialized"),
    Failed("failed"),
    InitializedWithErrors("initialized_with_errors"),
    AlreadyInitialized("already_initialized")
}

/** Per-device errors from [FishjamClient.initializeDevices]. Null means that device started. */
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
    val videoStarted = videoRequested && video == null
    val audioStarted = audioRequested && audio == null
    val anyFailed = videoFailed || audioFailed
    val anyStarted = videoStarted || audioStarted
    val status =
        when {
            anyFailed && anyStarted -> InitializeDevicesStatus.InitializedWithErrors
            anyFailed -> InitializeDevicesStatus.Failed
            else -> InitializeDevicesStatus.Initialized
        }
    val errors =
        if (status == InitializeDevicesStatus.Initialized) {
            null
        } else {
            DeviceErrors(audio = audio, video = video)
        }
    return InitializeDevicesResult(status = status, errors = errors)
}

internal fun interruptedInitializeDevicesResult(
    videoRequested: Boolean,
    audioRequested: Boolean
): InitializeDevicesResult {
    return InitializeDevicesResult(
        status = InitializeDevicesStatus.Failed,
        errors = DeviceErrors(
            audio = if (audioRequested) DeviceError.Unhandled else null,
            video = if (videoRequested) DeviceError.Unhandled else null
        )
    )
}

internal fun deviceErrorForCameraFailure(
    error: Throwable,
    listedDeviceCount: Int,
    requestedDeviceId: String?
): DeviceError {
    if (error is SecurityException) return DeviceError.NotAllowed
    val missingCamera =
        error.message == "No camera found" &&
            (error is IllegalArgumentException || error is IllegalStateException)
    if (!missingCamera) return DeviceError.Unhandled
    if (requestedDeviceId != null && listedDeviceCount > 0) return DeviceError.Overconstrained
    return DeviceError.NotFound
}

internal fun deviceErrorForMicrophoneFailure(error: Throwable): DeviceError {
    if (error is SecurityException) return DeviceError.NotAllowed
    return DeviceError.Unhandled
}
