package io.fishjam.client.voip

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives VoIP wake-up pushes over FCM.
 *
 * The signaling backend sends a high-priority **data** message (so this runs even
 * when the app is backgrounded or killed) with `fishjam: "voip-incoming"` plus
 * `roomName` / `displayName` / `handle` / `isVideo` / `avatarUrl`.
 *
 * Android delivers every FCM message to a single `MESSAGING_EVENT` service per app,
 * so this service also acts as a relay: messages that are not VoIP pushes — and every
 * token callback — are handed to the app's other messaging service, named by a
 * `VoIPFallbackMessagingService` manifest meta-data entry.
 *
 * Apps that need full control can remove this service (`tools:node="remove"`) and call
 * [handleVoIPMessage] / [handleNewToken] from their own service.
 */
class VoIPMessagingService : FirebaseMessagingService() {
    override fun onRegistered(token: String) {
        handleNewToken(token)
        forwardTokenToFallback(this, token)
    }

    override fun onNewToken(token: String) {
        handleNewToken(token)
        forwardTokenToFallback(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (handleVoIPMessage(this, message.data)) return
        forwardMessageToFallback(this, message)
    }

    override fun onDeletedMessages() {
        val fallback = fallbackServiceInstance(this) ?: return
        try {
            fallback.onDeletedMessages()
        } catch (e: Exception) {
            Log.w(TAG, "Fallback messaging service failed to handle onDeletedMessages", e)
        }
    }

    companion object Dispatch {
        private const val TAG = "VoIPMessagingService"

        /** `<meta-data>` key naming the messaging service non-VoIP traffic is relayed to. */
        const val FALLBACK_META_KEY = "VoIPFallbackMessagingService"

        const val DISCRIMINATOR_KEY = "fishjam"
        const val VOIP_INCOMING = "voip-incoming"

        @Volatile
        private var lastForwardedToken: String? = null

        /**
         * Handles a Fishjam VoIP push. Returns `true` if [data] carried a VoIP
         * payload and was consumed. Returns `false` for any other message.
         */
        @JvmStatic
        fun handleVoIPMessage(context: Context, data: Map<String, String>): Boolean {
            if (data[DISCRIMINATOR_KEY] != VOIP_INCOMING) {
                return false
            }
            val roomName = data["roomName"]
            if (roomName == null) {
                Log.w(TAG, "VoIP push without roomName dropped")
                return true
            }
            val displayName = data["displayName"] ?: "Incoming call"
            val handle = data["handle"]?.takeIf { it.isNotEmpty() } ?: displayName
            val isVideo = data["isVideo"]?.toBoolean() ?: false
            val avatarUrl = data["avatarUrl"]?.takeIf { it.isNotEmpty() }
            val incoming = VoIPPushRegistry.Incoming(roomName, displayName, handle, isVideo, avatarUrl)
            val appContext = context.applicationContext

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                when (CallManager.reportIncomingCall(appContext, displayName, handle, isVideo, avatarUrl)) {
                    IncomingCallSlot.CURRENT -> VoIPPushRegistry.reportIncoming(incoming)
                    IncomingCallSlot.WAITING -> VoIPPushRegistry.bufferWaitingIncoming(incoming)
                    IncomingCallSlot.REJECTED -> VoIPPushRegistry.reportRejectedIncoming(incoming)
                }
            } else {
                VoIPPushRegistry.reportIncoming(incoming)
            }
            return true
        }

        /** Convenience overload for a [RemoteMessage]. */
        @JvmStatic
        fun handleVoIPMessage(context: Context, message: RemoteMessage): Boolean =
            handleVoIPMessage(context, message.data)

        /** Records a fresh FCM token for VoIP. */
        @JvmStatic
        fun handleNewToken(token: String) {
            VoIPPushRegistry.updateToken(token)
        }

        private fun forwardMessageToFallback(context: Context, message: RemoteMessage) {
            val fallback = fallbackServiceInstance(context) ?: return
            try {
                fallback.onMessageReceived(message)
            } catch (e: Exception) {
                Log.w(TAG, "Fallback messaging service failed to handle a message", e)
            }
        }

        private fun forwardTokenToFallback(context: Context, token: String) {
            if (token == lastForwardedToken) return
            val fallback = fallbackServiceInstance(context) ?: return
            try {
                fallback.onNewToken(token)
                lastForwardedToken = token
            } catch (e: Exception) {
                Log.w(TAG, "Fallback messaging service failed to handle a token", e)
            }
        }

        private fun fallbackServiceInstance(context: Context): FirebaseMessagingService? {
            val className = fallbackClassName(context) ?: return null
            return try {
                val clazz = Class.forName(className)
                val instance = clazz.getDeclaredConstructor().newInstance()
                if (instance !is FirebaseMessagingService) {
                    Log.w(TAG, "$FALLBACK_META_KEY $className is not a FirebaseMessagingService")
                    return null
                }
                val attach =
                    generateSequence<Class<*>>(clazz) { it.superclass }
                        .firstNotNullOfOrNull { c ->
                            c.declaredMethods.firstOrNull {
                                it.name == "attachBaseContext" && it.parameterCount == 1
                            }
                        }
                if (attach == null) {
                    Log.w(TAG, "attachBaseContext not found on $className")
                    return null
                }
                attach.isAccessible = true
                attach.invoke(instance, context.applicationContext)
                instance
            } catch (e: Exception) {
                Log.w(TAG, "Could not instantiate fallback messaging service $className", e)
                null
            }
        }

        private fun fallbackClassName(context: Context): String? = try {
            context.packageManager
                .getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
                .metaData
                ?.getString(FALLBACK_META_KEY)
                ?.takeIf { it.isNotBlank() }
        } catch (_: PackageManager.NameNotFoundException) {
            null
        }
    }
}
