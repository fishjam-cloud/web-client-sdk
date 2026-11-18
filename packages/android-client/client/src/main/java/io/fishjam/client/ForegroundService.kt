package io.fishjam.client

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.content.res.Resources
import android.os.Build
import android.os.IBinder
import android.util.Log

/** How loudly the notification of the foreground service announces itself. */
enum class ForegroundServiceImportance {
    Low,
    High
}

/**
 * What the foreground service keeps alive and what its notification shows.
 *
 * @property enableCamera Keep the camera running in the background. Needs the `CAMERA` permission.
 * @property enableMicrophone Keep the microphone running in the background. Needs the `RECORD_AUDIO` permission.
 * @property enableScreenSharing Add the media projection type. Android 14 and later need the user's
 * screen capture consent before this takes effect.
 * @property channelId Id of the notification channel. Must be unique per app.
 * @property channelName Name of the notification channel, shown to the user in the system settings.
 * @property notificationTitle First row of the notification.
 * @property notificationContent Second row of the notification.
 * @property statusBarIcon Drawable resource for the icon in the status bar. `0` uses the system info icon.
 * Android paints this icon as a white silhouette, so pass a single-color image.
 * The circle next to the app name is the app's launcher icon, which Android draws itself.
 * @property importance [ForegroundServiceImportance.High] or [ForegroundServiceImportance.Low].
 * @property onlyAlertOnce Alert (sound, vibration) only the first time the notification shows.
 */
data class ForegroundServiceConfig(
    val enableCamera: Boolean = false,
    val enableMicrophone: Boolean = false,
    val enableScreenSharing: Boolean = false,
    val channelId: String = DEFAULT_CHANNEL_ID,
    val channelName: String = DEFAULT_CHANNEL_NAME,
    val notificationTitle: String = DEFAULT_TITLE,
    val notificationContent: String = DEFAULT_CONTENT,
    val statusBarIcon: Int = 0,
    val importance: ForegroundServiceImportance = ForegroundServiceImportance.High,
    val onlyAlertOnce: Boolean = false
) {
    companion object {
        const val DEFAULT_CHANNEL_ID = "com.fishjam.foregroundservice.channel"
        const val DEFAULT_CHANNEL_NAME = "Fishjam Notifications"
        const val DEFAULT_TITLE = "Your call is ongoing"
        const val DEFAULT_CONTENT = "Tap to return to the call."
    }
}

/**
 * Keeps a call running while the app is in the background, using an Android foreground service.
 * Call [start] when you join a room and [stop] when you leave it.
 *
 * The app declares the service and its permissions in its own `AndroidManifest.xml`:
 *
 * ```xml
 * <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
 * <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />
 * <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
 * <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
 * <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
 *
 * <service
 *     android:name="io.fishjam.client.FishjamForegroundService"
 *     android:exported="false"
 *     android:foregroundServiceType="camera|microphone|mediaProjection" />
 * ```
 */
object ForegroundService {
    private const val TAG = "FishjamForegroundService"

    /**
     * Starts the service, or replaces the config of the running one.
     * The service type is the union of camera, microphone and media projection that [config] enables
     * and that the app is allowed to use. With no type left, the service stops.
     *
     * On Android 13 and later this first asks for the notification permission when it was not asked yet.
     * When the user refuses, the service still starts: the notification is hidden, the app keeps running.
     */
    suspend fun start(context: Context, config: ForegroundServiceConfig = ForegroundServiceConfig()) {
        val appContext = context.applicationContext
        requestNotificationPermission(appContext)
        apply(appContext, config)
    }

    /** Stops the service and removes its notification. */
    fun stop(context: Context) {
        val appContext = context.applicationContext
        appContext.stopService(Intent(appContext, FishjamForegroundService::class.java))
    }

    private suspend fun requestNotificationPermission(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val permission = Manifest.permission.POST_NOTIFICATIONS
        if (OsPermissions.query(context, permission) != PermissionStatus.Prompt) return
        val status = OsPermissions.request(context, permission)
        if (status != PermissionStatus.Granted) {
            Log.w(TAG, "Notification permission was not granted, the notification will be hidden")
        }
    }

    private fun apply(context: Context, config: ForegroundServiceConfig) {
        val types =
            foregroundServiceTypes(
                config = config,
                sdkInt = Build.VERSION.SDK_INT,
                cameraGranted = isGranted(context, Manifest.permission.CAMERA),
                microphoneGranted = isGranted(context, Manifest.permission.RECORD_AUDIO)
            )
        val intent = Intent(context, FishjamForegroundService::class.java)
        if (types.isEmpty()) {
            context.stopService(intent)
            return
        }
        intent
            .putExtra(FishjamForegroundService.EXTRA_CHANNEL_ID, config.channelId)
            .putExtra(FishjamForegroundService.EXTRA_CHANNEL_NAME, config.channelName)
            .putExtra(FishjamForegroundService.EXTRA_TITLE, config.notificationTitle)
            .putExtra(FishjamForegroundService.EXTRA_CONTENT, config.notificationContent)
            .putExtra(FishjamForegroundService.EXTRA_STATUS_BAR_ICON, config.statusBarIcon)
            .putExtra(FishjamForegroundService.EXTRA_IMPORTANCE, config.importance.name)
            .putExtra(FishjamForegroundService.EXTRA_ONLY_ALERT_ONCE, config.onlyAlertOnce)
            .putExtra(FishjamForegroundService.EXTRA_TYPES, types.toIntArray())
        try {
            val component =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            if (component == null) {
                Log.e(TAG, "${FishjamForegroundService::class.java.name} is not declared in AndroidManifest.xml")
            }
        } catch (error: RuntimeException) {
            Log.e(TAG, "Failed to start the foreground service", error)
        }
    }

    private fun isGranted(context: Context, permission: String) =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
}

/**
 * The foreground service types for [config]. Empty when the service has nothing to keep alive.
 * Before Android 10 service types do not exist, so one `0` entry stands for "start the service".
 */
internal fun foregroundServiceTypes(
    config: ForegroundServiceConfig,
    sdkInt: Int,
    cameraGranted: Boolean,
    microphoneGranted: Boolean
): List<Int> {
    if (sdkInt < Build.VERSION_CODES.Q) {
        val anyEnabled = config.enableCamera || config.enableMicrophone || config.enableScreenSharing
        return if (anyEnabled) listOf(0) else emptyList()
    }
    return buildList {
        if (config.enableCamera && cameraGranted) add(ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
        if (config.enableMicrophone && microphoneGranted) add(ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        if (config.enableScreenSharing) add(ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    }
}

/**
 * Foreground service that keeps the app process, and so the call, running while the app is in the
 * background. Start it with [ForegroundService.start]. The app declares it in its `AndroidManifest.xml`.
 */
class FishjamForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent != null) startInForeground(intent)
        return START_NOT_STICKY
    }

    private fun startInForeground(intent: Intent) {
        val channelId = intent.getStringExtra(EXTRA_CHANNEL_ID) ?: return
        val channelName = intent.getStringExtra(EXTRA_CHANNEL_NAME) ?: return
        val highImportance = intent.getStringExtra(EXTRA_IMPORTANCE) != ForegroundServiceImportance.Low.name
        val types = intent.getIntArrayExtra(EXTRA_TYPES)?.fold(0) { acc, type -> acc or type } ?: 0

        createChannel(channelId, channelName, highImportance)
        val notification =
            buildNotification(
                channelId = channelId,
                title = intent.getStringExtra(EXTRA_TITLE),
                content = intent.getStringExtra(EXTRA_CONTENT),
                statusBarIcon = intent.getIntExtra(EXTRA_STATUS_BAR_ICON, 0),
                highImportance = highImportance,
                onlyAlertOnce = intent.getBooleanExtra(EXTRA_ONLY_ALERT_ONCE, false)
            )

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification)
            return
        }
        try {
            startForeground(NOTIFICATION_ID, notification, types)
        } catch (error: SecurityException) {
            // Android 14 and later refuse mediaProjection before the user consents to screen capture.
            // A service that never reaches the foreground crashes the app, so retry without it.
            val withoutProjection = types and ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION.inv()
            Log.w(TAG, "Could not start with types $types, retrying with $withoutProjection", error)
            startForeground(NOTIFICATION_ID, notification, withoutProjection)
        }
    }

    private fun buildNotification(
        channelId: String,
        title: String?,
        content: String?,
        statusBarIcon: Int,
        highImportance: Boolean,
        onlyAlertOnce: Boolean
    ): Notification {
        val launchIntent =
            packageManager.getLaunchIntentForPackage(packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
        val contentIntent =
            launchIntent?.let {
                PendingIntent.getActivity(
                    this,
                    0,
                    it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            }
        val builder =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, channelId)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this).setPriority(
                    if (highImportance) Notification.PRIORITY_HIGH else Notification.PRIORITY_LOW
                )
            }
        builder
            .setContentTitle(title)
            .setContentText(content)
            .setContentIntent(contentIntent)
            .setOnlyAlertOnce(onlyAlertOnce)
            .setOngoing(true)
        val statusBarIconId = statusBarIcon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
        try {
            builder.setSmallIcon(statusBarIconId)
        } catch (error: Resources.NotFoundException) {
            Log.w(TAG, "Status bar icon $statusBarIconId was not found, using the system icon", error)
            builder.setSmallIcon(android.R.drawable.ic_dialog_info)
        }
        return builder.build()
    }

    private fun createChannel(channelId: String, channelName: String, highImportance: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val level = if (highImportance) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_LOW
        getSystemService(NotificationManager::class.java)
            ?.createNotificationChannel(NotificationChannel(channelId, channelName, level))
    }

    internal companion object {
        private const val TAG = "FishjamForegroundService"
        private const val NOTIFICATION_ID = 0x46_4A_46_53

        const val EXTRA_CHANNEL_ID = "channelId"
        const val EXTRA_CHANNEL_NAME = "channelName"
        const val EXTRA_TITLE = "notificationTitle"
        const val EXTRA_CONTENT = "notificationContent"
        const val EXTRA_STATUS_BAR_ICON = "statusBarIcon"
        const val EXTRA_IMPORTANCE = "importance"
        const val EXTRA_ONLY_ALERT_ONCE = "onlyAlertOnce"
        const val EXTRA_TYPES = "foregroundServiceTypes"
    }
}
