#include <jni.h>
#include <stdint.h>
#include <string.h>

#include "fishjam.h"

namespace {

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

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_io_fishjam_client_NativeCore_nativeCreate(JNIEnv *env, jclass, jbyteArray config) {
    ByteArrayView view(env, config);
    FishjamClient *client = fishjam_client_new(view.bytes(), static_cast<size_t>(view.len), nullptr, nullptr);
    return reinterpret_cast<jlong>(client);
}

extern "C" JNIEXPORT jobject JNICALL
Java_io_fishjam_client_NativeCore_nativeCall(JNIEnv *env, jclass, jlong handle, jbyteArray request) {
    FishjamBuf out;
    memset(&out, 0, sizeof(out));

    int32_t code;
    {
        ByteArrayView view(env, request);
        code = fishjam_client_call(reinterpret_cast<FishjamClient *>(handle), view.bytes(),
                                   static_cast<size_t>(view.len), &out);
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
Java_io_fishjam_client_NativeCore_nativeDestroy(JNIEnv *, jclass, jlong handle) {
    fishjam_client_free(reinterpret_cast<FishjamClient *>(handle));
}
