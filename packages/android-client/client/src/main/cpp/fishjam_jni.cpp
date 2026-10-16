#include <jni.h>
#include <stdint.h>
#include <string.h>

#include "fishjam.h"

namespace {

JavaVM *g_vm = nullptr;

struct ByteArrayView {
    JNIEnv *env;
    jbyteArray array;
    jbyte *data = nullptr;
    jsize len = 0;

    ByteArrayView(JNIEnv *env, jbyteArray array) : env(env), array(array) {
        if (array != nullptr) {
            len = env->GetArrayLength(array);
            if (len > 0) data = env->GetByteArrayElements(array, nullptr);
        }
    }

    ~ByteArrayView() {
        if (data != nullptr) env->ReleaseByteArrayElements(array, data, JNI_ABORT);
    }

    const uint8_t *bytes() const { return reinterpret_cast<const uint8_t *>(data); }
};

struct NativeHandle {
    FishjamClient *client = nullptr;
    jobject listener = nullptr;
    jmethodID on_event = nullptr;
};

void on_event(void *user_data, const uint8_t *event, size_t event_len) {
    auto *handle = static_cast<NativeHandle *>(user_data);
    if (g_vm == nullptr || handle->listener == nullptr || handle->on_event == nullptr) return;

    JNIEnv *env = nullptr;
    bool attached = false;
    if (g_vm->GetEnv(reinterpret_cast<void **>(&env), JNI_VERSION_1_6) != JNI_OK) {
        if (g_vm->AttachCurrentThread(&env, nullptr) != JNI_OK) return;
        attached = true;
    }

    jbyteArray payload = env->NewByteArray(static_cast<jsize>(event_len));
    if (payload != nullptr && event_len > 0) {
        env->SetByteArrayRegion(payload, 0, static_cast<jsize>(event_len), reinterpret_cast<const jbyte *>(event));
    }
    env->CallVoidMethod(handle->listener, handle->on_event, payload);
    if (env->ExceptionCheck()) env->ExceptionClear();
    env->DeleteLocalRef(payload);
    if (attached) g_vm->DetachCurrentThread();
}

}  // namespace

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
    g_vm = vm;
    return JNI_VERSION_1_6;
}

extern "C" JNIEXPORT jlong JNICALL
Java_io_fishjam_client_NativeCore_nativeCreate(JNIEnv *env, jclass, jbyteArray config, jobject events) {
    if (events == nullptr) return 0;

    jobject listener = env->NewGlobalRef(events);
    jclass clazz = env->GetObjectClass(events);
    jmethodID method = env->GetMethodID(clazz, "onEvent", "([B)V");
    env->DeleteLocalRef(clazz);
    if (listener == nullptr || method == nullptr) {
        if (listener != nullptr) env->DeleteGlobalRef(listener);
        return 0;
    }

    auto *handle = new NativeHandle();
    handle->listener = listener;
    handle->on_event = method;

    ByteArrayView view(env, config);
    handle->client = fishjam_client_new(view.bytes(), static_cast<size_t>(view.len), on_event, handle);
    if (handle->client == nullptr) {
        env->DeleteGlobalRef(listener);
        delete handle;
        return 0;
    }
    return reinterpret_cast<jlong>(handle);
}

extern "C" JNIEXPORT jobject JNICALL
Java_io_fishjam_client_NativeCore_nativeCall(JNIEnv *env, jclass, jlong jhandle, jbyteArray request) {
    auto *handle = reinterpret_cast<NativeHandle *>(jhandle);
    FishjamBuf out;
    memset(&out, 0, sizeof(out));

    int32_t code;
    {
        ByteArrayView view(env, request);
        code = fishjam_client_call(handle->client, view.bytes(), static_cast<size_t>(view.len), &out);
    }

    jsize out_len = out.data != nullptr ? static_cast<jsize>(out.len) : 0;
    jbyteArray payload = env->NewByteArray(out_len);
    if (out_len > 0) {
        env->SetByteArrayRegion(payload, 0, out_len, reinterpret_cast<const jbyte *>(out.data));
    }
    fishjam_buf_free(out);

    jclass result_class = env->FindClass("io/fishjam/client/NativeCallResult");
    jmethodID ctor = env->GetMethodID(result_class, "<init>", "(I[B)V");
    return env->NewObject(result_class, ctor, code, payload);
}

extern "C" JNIEXPORT void JNICALL
Java_io_fishjam_client_NativeCore_nativeDestroy(JNIEnv *env, jclass, jlong jhandle) {
    if (jhandle == 0) return;
    auto *handle = reinterpret_cast<NativeHandle *>(jhandle);
    fishjam_client_free(handle->client);
    if (handle->listener != nullptr) env->DeleteGlobalRef(handle->listener);
    delete handle;
}
