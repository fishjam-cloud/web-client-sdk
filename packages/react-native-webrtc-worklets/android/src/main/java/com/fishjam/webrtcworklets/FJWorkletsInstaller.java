package com.fishjam.webrtcworklets;

import com.facebook.jni.HybridData;
import com.facebook.proguard.annotations.DoNotStrip;
import com.facebook.react.bridge.Promise;
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl;

import java.util.ArrayList;
import java.util.List;

/**
 * Installs the JS global {@code __fishjamWebrtcWorklets} through which the JS side
 * creates camera frame consumers.
 *
 * <p>A JSI global must be set on the JS thread with the live runtime, which a React
 * method cannot do directly, so the React {@link CallInvokerHolderImpl} goes down to
 * C++ ({@link #initHybrid}); the native installer hops onto the JS thread, sets the
 * global and calls {@link #onInstalled()} back here, which resolves every waiting
 * Promise. Each call re-runs the native install because a JS reload recreates the
 * runtime while this object survives.
 */
@DoNotStrip
final class FJWorkletsInstaller {
    static {
        System.loadLibrary("fishjam-webrtc-worklets");
    }

    private final HybridData mHybridData;

    // Callers waiting for the JSI global to be installed. Guarded by `this`.
    private final List<Promise> pendingInstalls = new ArrayList<>();

    FJWorkletsInstaller(CallInvokerHolderImpl callInvokerHolder) {
        mHybridData = initHybrid(callInvokerHolder);
    }

    void install(Promise promise) {
        synchronized (this) {
            pendingInstalls.add(promise);
        }
        install();
    }

    /** Invoked from C++ on the JS thread once the global has been set. */
    @DoNotStrip
    private void onInstalled() {
        List<Promise> promises;
        synchronized (this) {
            promises = new ArrayList<>(pendingInstalls);
            pendingInstalls.clear();
        }
        for (Promise promise : promises) {
            promise.resolve(null);
        }
    }

    @DoNotStrip
    private native HybridData initHybrid(CallInvokerHolderImpl callInvokerHolder);

    @DoNotStrip
    private native void install();
}
