package io.fishjam.client

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Asks the user for screen capture consent and returns the result [Intent]
 * that [org.webrtc.ScreenCapturerAndroid] needs.
 */
internal object ScreenCaptureConsent {
    private val mutex = Mutex()
    private val pending = ConcurrentHashMap<String, CompletableDeferred<Intent?>>()

    /**
     * Shows the system screen capture dialog.
     * Returns the result intent when the user allows capture, or null when they cancel.
     */
    suspend fun request(context: Context): Intent? {
        val appContext = context.applicationContext
        return mutex.withLock {
            val token = UUID.randomUUID().toString()
            val deferred = CompletableDeferred<Intent?>()
            pending[token] = deferred
            try {
                withContext(Dispatchers.Main.immediate) {
                    val intent =
                        Intent(appContext, ScreenCaptureConsentActivity::class.java)
                            .putExtra(ScreenCaptureConsentActivity.EXTRA_TOKEN, token)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
                    appContext.startActivity(intent)
                }
                deferred.await()
            } finally {
                pending.remove(token)
            }
        }
    }

    fun complete(token: String, result: Intent?) {
        pending.remove(token)?.complete(result)
    }
}

internal class ScreenCaptureConsentActivity : Activity() {
    private val delivered = AtomicBoolean(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val token = intent.getStringExtra(EXTRA_TOKEN)
        if (savedInstanceState != null || token.isNullOrEmpty()) {
            if (!isFinishing) finish()
            return
        }
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
        if (manager == null) {
            deliver(null)
            return
        }
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(captureIntent(manager), REQUEST_CODE)
        } catch (_: RuntimeException) {
            deliver(null)
        }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_CODE) return
        deliver(if (resultCode == RESULT_OK) data else null)
    }

    override fun onDestroy() {
        if (isFinishing && !isChangingConfigurations) {
            deliver(null)
        }
        super.onDestroy()
    }

    private fun captureIntent(manager: MediaProjectionManager): Intent {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return manager.createScreenCaptureIntent(
                MediaProjectionConfig.createConfigForDefaultDisplay()
            )
        }
        return manager.createScreenCaptureIntent()
    }

    private fun deliver(result: Intent?) {
        if (!delivered.compareAndSet(false, true)) return
        val token = intent.getStringExtra(EXTRA_TOKEN) ?: return
        ScreenCaptureConsent.complete(token, result)
        if (!isFinishing) finish()
    }

    companion object {
        const val EXTRA_TOKEN = "io.fishjam.client.screenCapture.token"
        private const val REQUEST_CODE = 42
    }
}
