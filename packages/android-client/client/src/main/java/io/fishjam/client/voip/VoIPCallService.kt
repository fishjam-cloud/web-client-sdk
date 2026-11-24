package io.fishjam.client.voip

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Foreground service that keeps a VoIP call alive while the app is in the background.
 * Posts a CallStyle notification under [CallNotificationManager.NOTIFICATION_ID].
 */
@RequiresApi(Build.VERSION_CODES.O)
class VoIPCallService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        val displayName = intent.getStringExtra(EXTRA_DISPLAY_NAME).orEmpty()
        val connecting = intent.getBooleanExtra(EXTRA_CONNECTING, false)
        val held = intent.getBooleanExtra(EXTRA_HELD, false)
        val connectedAt = intent.getLongExtra(EXTRA_CONNECTED_AT, 0L)
        val notificationManager = CallNotificationManager()
        val notification: Notification =
            when {
                connecting -> notificationManager.buildConnecting(this, displayName)
                held -> notificationManager.buildHeld(this, displayName, connectedAt)
                else -> notificationManager.buildOngoing(this, displayName, connectedAt)
            }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    CallNotificationManager.NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                )
            } else {
                startForeground(CallNotificationManager.NOTIFICATION_ID, notification)
            }
        } catch (error: RuntimeException) {
            Log.e(TAG, "Failed to start VoIP call foreground service", error)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    companion object {
        private const val TAG = "VoIPCallService"
        private const val EXTRA_DISPLAY_NAME = "displayName"
        private const val EXTRA_CONNECTING = "connecting"
        private const val EXTRA_HELD = "held"
        private const val EXTRA_CONNECTED_AT = "connectedAt"

        fun startConnecting(context: Context, displayName: String) {
            start(context, displayName, connecting = true, held = false, connectedAt = 0L)
        }

        fun startConnected(context: Context, displayName: String, connectedAt: Long) {
            start(context, displayName, connecting = false, held = false, connectedAt = connectedAt)
        }

        fun startHeld(context: Context, displayName: String, connectedAt: Long) {
            start(context, displayName, connecting = false, held = true, connectedAt = connectedAt)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, VoIPCallService::class.java))
        }

        private fun start(
            context: Context,
            displayName: String,
            connecting: Boolean,
            held: Boolean,
            connectedAt: Long
        ) {
            val intent =
                Intent(context, VoIPCallService::class.java)
                    .putExtra(EXTRA_DISPLAY_NAME, displayName)
                    .putExtra(EXTRA_CONNECTING, connecting)
                    .putExtra(EXTRA_HELD, held)
                    .putExtra(EXTRA_CONNECTED_AT, connectedAt)
            try {
                context.startForegroundService(intent)
            } catch (error: RuntimeException) {
                Log.e(TAG, "Failed to start VoIPCallService", error)
            }
        }
    }
}

/**
 * Translates Core-Telecom call lifecycle into [VoIPCallService] start/stop.
 */
@RequiresApi(Build.VERSION_CODES.O)
object VoIPCallServiceController {
    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var displayName: String = ""

    @Volatile
    private var connectedAtMs: Long = 0L

    @Volatile
    private var active = false

    fun ensureContext(context: Context) {
        appContext = context.applicationContext
    }

    fun onCallConnecting(displayName: String?, @Suppress("UNUSED_PARAMETER") isVideo: Boolean) {
        val ctx = appContext ?: return
        this.displayName = displayName.orEmpty()
        active = true
        connectedAtMs = 0L
        VoIPCallService.startConnecting(ctx, this.displayName)
    }

    fun onCallConnected(displayName: String?, @Suppress("UNUSED_PARAMETER") isVideo: Boolean) {
        val ctx = appContext ?: return
        this.displayName = displayName.orEmpty()
        active = true
        connectedAtMs = System.currentTimeMillis()
        VoIPCallService.startConnected(ctx, this.displayName, connectedAtMs)
    }

    fun onCallHeld(held: Boolean) {
        if (!active) return
        val ctx = appContext ?: return
        if (held) {
            VoIPCallService.startHeld(ctx, displayName, connectedAtMs.coerceAtLeast(System.currentTimeMillis()))
        } else if (connectedAtMs > 0L) {
            VoIPCallService.startConnected(ctx, displayName, connectedAtMs)
        } else {
            VoIPCallService.startConnecting(ctx, displayName)
        }
    }

    fun onCallEnded() {
        active = false
        connectedAtMs = 0L
        appContext?.let { VoIPCallService.stop(it) }
    }
}
