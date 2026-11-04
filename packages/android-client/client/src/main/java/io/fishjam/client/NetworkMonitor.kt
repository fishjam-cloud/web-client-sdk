package io.fishjam.client

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities

/**
 * Watches the device's default network and reports changes to the core so a
 * dropped call waits while the device has no network, then retries as soon
 * as a network exists again.
 *
 * [ConnectivityManager.getActiveNetwork] is still the network being lost
 * inside [ConnectivityManager.NetworkCallback.onLost], so that callback
 * reports offline directly instead of asking again.
 */
internal class NetworkMonitor(context: Context, private val onChange: (online: Boolean, networkId: String) -> Unit) {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private var current: Network? = null

    private val callback =
        object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                current = network
                publish(connectivityManager.getNetworkCapabilities(network))
            }

            override fun onLost(network: Network) {
                if (current != null && current != network) return
                current = null
                onChange(false, "")
            }

            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                if (current != network) return
                publish(networkCapabilities)
            }
        }

    fun start() {
        connectivityManager.registerDefaultNetworkCallback(callback)
    }

    fun stop() {
        runCatching { connectivityManager.unregisterNetworkCallback(callback) }
    }

    private fun publish(capabilities: NetworkCapabilities?) {
        val online = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        onChange(online, if (online) networkId(capabilities) else "")
    }

    /** Transport of the current network, so a Wi-Fi roam is not a new network. */
    private fun networkId(capabilities: NetworkCapabilities?): String {
        if (capabilities == null) return ""
        val transport =
            listOf(
                NetworkCapabilities.TRANSPORT_WIFI,
                NetworkCapabilities.TRANSPORT_CELLULAR,
                NetworkCapabilities.TRANSPORT_ETHERNET,
                NetworkCapabilities.TRANSPORT_VPN,
                NetworkCapabilities.TRANSPORT_BLUETOOTH
            ).firstOrNull { capabilities.hasTransport(it) } ?: return ""
        return transport.toString()
    }
}
