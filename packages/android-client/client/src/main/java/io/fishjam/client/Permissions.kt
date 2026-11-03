package io.fishjam.client

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
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
 * Current status of the camera or microphone permission.
 *
 * - [Granted] — the user has granted the permission.
 * - [Denied] — the user has denied the permission and the system will not ask again.
 * - [Prompt] — the user has not been asked yet, or the permission can be requested again.
 */
enum class PermissionStatus {
    Granted,
    Denied,
    Prompt;

    val label: String
        get() =
            when (this) {
                Granted -> "granted"
                Denied -> "denied"
                Prompt -> "prompt"
            }
}

internal fun permissionStatus(granted: Boolean, requested: Boolean, permanentlyDenied: Boolean): PermissionStatus {
    if (granted) return PermissionStatus.Granted
    if (!requested || !permanentlyDenied) return PermissionStatus.Prompt
    return PermissionStatus.Denied
}

internal object OsPermissions {
    private const val PREFS = "io.fishjam.client.permissions"
    private val mutex = Mutex()
    private val pending = ConcurrentHashMap<String, CompletableDeferred<Outcome>>()

    fun query(context: Context, permission: String): PermissionStatus {
        val appContext = context.applicationContext
        val granted = isGranted(appContext, permission)
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (granted) {
            if (prefs.getBoolean(deniedKey(permission), false)) {
                prefs.edit().putBoolean(deniedKey(permission), false).apply()
            }
            return PermissionStatus.Granted
        }
        return permissionStatus(
            granted = false,
            requested = prefs.getBoolean(askedKey(permission), false),
            permanentlyDenied = prefs.getBoolean(deniedKey(permission), false)
        )
    }

    suspend fun request(context: Context, permission: String): PermissionStatus {
        val appContext = context.applicationContext
        if (isGranted(appContext, permission)) return PermissionStatus.Granted
        return mutex.withLock {
            if (isGranted(appContext, permission)) return@withLock PermissionStatus.Granted
            val token = UUID.randomUUID().toString()
            val deferred = CompletableDeferred<Outcome>()
            pending[token] = deferred
            try {
                withContext(Dispatchers.Main.immediate) {
                    val intent =
                        Intent(appContext, PermissionRequestActivity::class.java)
                            .putExtra(PermissionRequestActivity.EXTRA_PERMISSION, permission)
                            .putExtra(PermissionRequestActivity.EXTRA_TOKEN, token)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
                    appContext.startActivity(intent)
                }
                val outcome = deferred.await()
                if (!outcome.fromSystem) return@withLock query(appContext, permission)
                appContext
                    .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(askedKey(permission), true)
                    .putBoolean(deniedKey(permission), !outcome.granted && !outcome.canAskAgain)
                    .apply()
                permissionStatus(
                    granted = outcome.granted,
                    requested = true,
                    permanentlyDenied = !outcome.granted && !outcome.canAskAgain
                )
            } finally {
                pending.remove(token)
            }
        }
    }

    fun complete(token: String, outcome: Outcome) {
        pending.remove(token)?.complete(outcome)
    }

    private fun isGranted(context: Context, permission: String): Boolean {
        return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }

    private fun askedKey(permission: String) = "asked:$permission"

    private fun deniedKey(permission: String) = "denied:$permission"
}

internal data class Outcome(val granted: Boolean, val canAskAgain: Boolean, val fromSystem: Boolean)

internal class PermissionRequestActivity : Activity() {
    private val delivered = AtomicBoolean(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val permission = intent.getStringExtra(EXTRA_PERMISSION)
        val token = intent.getStringExtra(EXTRA_TOKEN)
        if (savedInstanceState != null || permission.isNullOrEmpty() || token.isNullOrEmpty()) {
            if (!isFinishing) finish()
            return
        }
        try {
            requestPermissions(arrayOf(permission), REQUEST_CODE)
        } catch (_: RuntimeException) {
            deliver(granted = false, canAskAgain = false, fromSystem = true)
        }
    }

    @Suppress("DEPRECATION")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_CODE) return
        val permission = permissions.firstOrNull() ?: intent.getStringExtra(EXTRA_PERMISSION).orEmpty()
        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        val canAskAgain = permission.isNotEmpty() && !granted && shouldShowRequestPermissionRationale(permission)
        deliver(granted, canAskAgain, fromSystem = true)
    }

    override fun onDestroy() {
        if (isFinishing && !isChangingConfigurations) {
            deliver(granted = false, canAskAgain = true, fromSystem = false)
        }
        super.onDestroy()
    }

    private fun deliver(granted: Boolean, canAskAgain: Boolean, fromSystem: Boolean) {
        if (!delivered.compareAndSet(false, true)) return
        val token = intent.getStringExtra(EXTRA_TOKEN) ?: return
        OsPermissions.complete(token, Outcome(granted, canAskAgain, fromSystem))
        if (fromSystem && !isFinishing) finish()
    }

    companion object {
        const val EXTRA_PERMISSION = "io.fishjam.client.permission"
        const val EXTRA_TOKEN = "io.fishjam.client.permission.token"
        private const val REQUEST_CODE = 41
    }
}
