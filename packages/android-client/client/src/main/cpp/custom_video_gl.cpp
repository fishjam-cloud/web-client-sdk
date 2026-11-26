// Imports an AHardwareBuffer into a GL_TEXTURE_EXTERNAL_OES texture and waits on a
// sync-fd fence. Every GL call runs on the SurfaceTextureHelper thread, which
// has WebRTC's shared EGL context current.

#include <android/hardware_buffer.h>
#include <android/hardware_buffer_jni.h>
#include <android/log.h>
#include <jni.h>

#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>

#include <dlfcn.h>
#include <unistd.h>

namespace {

constexpr EGLTimeKHR kFenceWaitTimeoutNs = 2000000000ULL;
constexpr const char* kTag = "FishjamCustomVideo";

struct EglExtensions {
    PFNEGLGETNATIVECLIENTBUFFERANDROIDPROC eglGetNativeClientBufferANDROID = nullptr;
    PFNEGLCREATEIMAGEKHRPROC eglCreateImageKHR = nullptr;
    PFNEGLDESTROYIMAGEKHRPROC eglDestroyImageKHR = nullptr;
    PFNGLEGLIMAGETARGETTEXTURE2DOESPROC glEGLImageTargetTexture2DOES = nullptr;
    PFNEGLCREATESYNCKHRPROC eglCreateSyncKHR = nullptr;
    PFNEGLCLIENTWAITSYNCKHRPROC eglClientWaitSyncKHR = nullptr;
    PFNEGLDESTROYSYNCKHRPROC eglDestroySyncKHR = nullptr;

    bool canImportImages() const {
        return eglGetNativeClientBufferANDROID != nullptr && eglCreateImageKHR != nullptr &&
               glEGLImageTargetTexture2DOES != nullptr;
    }
};

const EglExtensions& extensions() {
    static const EglExtensions table = [] {
        EglExtensions resolved;
        resolved.eglGetNativeClientBufferANDROID = reinterpret_cast<PFNEGLGETNATIVECLIENTBUFFERANDROIDPROC>(
                eglGetProcAddress("eglGetNativeClientBufferANDROID"));
        resolved.eglCreateImageKHR =
                reinterpret_cast<PFNEGLCREATEIMAGEKHRPROC>(eglGetProcAddress("eglCreateImageKHR"));
        resolved.eglDestroyImageKHR =
                reinterpret_cast<PFNEGLDESTROYIMAGEKHRPROC>(eglGetProcAddress("eglDestroyImageKHR"));
        resolved.glEGLImageTargetTexture2DOES = reinterpret_cast<PFNGLEGLIMAGETARGETTEXTURE2DOESPROC>(
                eglGetProcAddress("glEGLImageTargetTexture2DOES"));
        resolved.eglCreateSyncKHR =
                reinterpret_cast<PFNEGLCREATESYNCKHRPROC>(eglGetProcAddress("eglCreateSyncKHR"));
        resolved.eglClientWaitSyncKHR =
                reinterpret_cast<PFNEGLCLIENTWAITSYNCKHRPROC>(eglGetProcAddress("eglClientWaitSyncKHR"));
        resolved.eglDestroySyncKHR =
                reinterpret_cast<PFNEGLDESTROYSYNCKHRPROC>(eglGetProcAddress("eglDestroySyncKHR"));
        return resolved;
    }();
    return table;
}

// Resolved at runtime so this file can compile for minSdk 24. Callers reject API < 26.
AHardwareBuffer* bufferFromJava(JNIEnv* env, jobject hardwareBuffer) {
    if (hardwareBuffer == nullptr) {
        return nullptr;
    }
    using Fn = AHardwareBuffer* (*)(JNIEnv*, jobject);
    static Fn fromJava = reinterpret_cast<Fn>(dlsym(RTLD_DEFAULT, "AHardwareBuffer_fromHardwareBuffer"));
    if (fromJava == nullptr) {
        return nullptr;
    }
    return fromJava(env, hardwareBuffer);
}

void acquireBuffer(AHardwareBuffer* buffer) {
    using Fn = void (*)(AHardwareBuffer*);
    static Fn acquire = reinterpret_cast<Fn>(dlsym(RTLD_DEFAULT, "AHardwareBuffer_acquire"));
    if (acquire != nullptr) {
        acquire(buffer);
    }
}

void releaseBuffer(AHardwareBuffer* buffer) {
    using Fn = void (*)(AHardwareBuffer*);
    static Fn release = reinterpret_cast<Fn>(dlsym(RTLD_DEFAULT, "AHardwareBuffer_release"));
    if (release != nullptr) {
        release(buffer);
    }
}

void describeBuffer(const AHardwareBuffer* buffer, AHardwareBuffer_Desc* desc) {
    using Fn = void (*)(const AHardwareBuffer*, AHardwareBuffer_Desc*);
    static Fn describe = reinterpret_cast<Fn>(dlsym(RTLD_DEFAULT, "AHardwareBuffer_describe"));
    if (describe != nullptr) {
        describe(buffer, desc);
    }
}

}  // namespace

extern "C" {

jlongArray importBuffer(JNIEnv* env, AHardwareBuffer* buffer) {
    if (buffer == nullptr) {
        return nullptr;
    }
    const EglExtensions& ext = extensions();
    if (!ext.canImportImages() || eglGetCurrentContext() == EGL_NO_CONTEXT) {
        return nullptr;
    }
    EGLDisplay display = eglGetCurrentDisplay();
    if (display == EGL_NO_DISPLAY) {
        return nullptr;
    }
    EGLClientBuffer clientBuffer = ext.eglGetNativeClientBufferANDROID(buffer);
    if (clientBuffer == nullptr) {
        return nullptr;
    }
    const EGLint imageAttribs[] = {EGL_NONE};
    EGLImageKHR eglImage =
            ext.eglCreateImageKHR(display, EGL_NO_CONTEXT, EGL_NATIVE_BUFFER_ANDROID, clientBuffer, imageAttribs);
    if (eglImage == EGL_NO_IMAGE_KHR) {
        return nullptr;
    }
    while (glGetError() != GL_NO_ERROR) {
    }
    GLuint texId = 0;
    glGenTextures(1, &texId);
    glBindTexture(GL_TEXTURE_EXTERNAL_OES, texId);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    ext.glEGLImageTargetTexture2DOES(GL_TEXTURE_EXTERNAL_OES, static_cast<GLeglImageOES>(eglImage));
    GLenum glError = glGetError();
    glBindTexture(GL_TEXTURE_EXTERNAL_OES, 0);
    if (glError != GL_NO_ERROR) {
        glDeleteTextures(1, &texId);
        ext.eglDestroyImageKHR(display, eglImage);
        return nullptr;
    }
    jlongArray result = env->NewLongArray(2);
    if (result == nullptr) {
        glDeleteTextures(1, &texId);
        ext.eglDestroyImageKHR(display, eglImage);
        return nullptr;
    }
    jlong values[2] = {reinterpret_cast<jlong>(eglImage), static_cast<jlong>(texId)};
    env->SetLongArrayRegion(result, 0, 2, values);
    return result;
}

JNIEXPORT jlongArray JNICALL
Java_io_fishjam_client_CustomVideoNative_importToTexture(JNIEnv* env, jclass /* clazz */, jobject hardwareBuffer) {
    return importBuffer(env, bufferFromJava(env, hardwareBuffer));
}

JNIEXPORT jlongArray JNICALL
Java_io_fishjam_client_CustomVideoNative_importHandleToTexture(JNIEnv* env, jclass /* clazz */, jlong handle) {
    if (handle == 0) {
        return nullptr;
    }
    return importBuffer(env, reinterpret_cast<AHardwareBuffer*>(handle));
}

JNIEXPORT jboolean JNICALL
Java_io_fishjam_client_CustomVideoNative_waitSyncFd(JNIEnv* /* env */, jclass /* clazz */, jint fenceFd) {
    if (fenceFd < 0) {
        return JNI_TRUE;
    }
    const EglExtensions& ext = extensions();
    if (ext.eglCreateSyncKHR == nullptr || ext.eglClientWaitSyncKHR == nullptr) {
        close(fenceFd);
        return JNI_FALSE;
    }
    EGLDisplay display = eglGetCurrentDisplay();
    if (display == EGL_NO_DISPLAY) {
        close(fenceFd);
        return JNI_FALSE;
    }
    const EGLint syncAttribs[] = {EGL_SYNC_NATIVE_FENCE_FD_ANDROID, fenceFd, EGL_NONE};
    EGLSyncKHR sync = ext.eglCreateSyncKHR(display, EGL_SYNC_NATIVE_FENCE_ANDROID, syncAttribs);
    if (sync == EGL_NO_SYNC_KHR) {
        close(fenceFd);
        return JNI_FALSE;
    }
    EGLint waitStatus = ext.eglClientWaitSyncKHR(display, sync, EGL_SYNC_FLUSH_COMMANDS_BIT_KHR, kFenceWaitTimeoutNs);
    if (ext.eglDestroySyncKHR != nullptr) {
        ext.eglDestroySyncKHR(display, sync);
    }
    return waitStatus == EGL_CONDITION_SATISFIED_KHR ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL Java_io_fishjam_client_CustomVideoNative_releaseImportedTexture(
        JNIEnv* /* env */, jclass /* clazz */, jlong eglImageHandle, jint texId) {
    if (eglGetCurrentContext() == EGL_NO_CONTEXT) {
        __android_log_print(ANDROID_LOG_WARN, kTag, "releaseImportedTexture without an EGL context");
        return;
    }
    EGLDisplay display = eglGetCurrentDisplay();
    if (texId != 0) {
        GLuint id = static_cast<GLuint>(texId);
        glDeleteTextures(1, &id);
    }
    const EglExtensions& ext = extensions();
    if (eglImageHandle != 0 && display != EGL_NO_DISPLAY && ext.eglDestroyImageKHR != nullptr) {
        ext.eglDestroyImageKHR(display, reinterpret_cast<EGLImageKHR>(eglImageHandle));
    }
}

JNIEXPORT void JNICALL
Java_io_fishjam_client_CustomVideoNative_closeFd(JNIEnv* /* env */, jclass /* clazz */, jint fenceFd) {
    if (fenceFd >= 0) {
        close(fenceFd);
    }
}

JNIEXPORT jlong JNICALL
Java_io_fishjam_client_CustomVideoNative_acquire(JNIEnv* env, jclass /* clazz */, jobject hardwareBuffer) {
    AHardwareBuffer* buffer = bufferFromJava(env, hardwareBuffer);
    if (buffer == nullptr) {
        return 0;
    }
    acquireBuffer(buffer);
    return reinterpret_cast<jlong>(buffer);
}

JNIEXPORT void JNICALL
Java_io_fishjam_client_CustomVideoNative_release(JNIEnv* /* env */, jclass /* clazz */, jlong handle) {
    if (handle == 0) {
        return;
    }
    releaseBuffer(reinterpret_cast<AHardwareBuffer*>(handle));
}

JNIEXPORT jintArray JNICALL
Java_io_fishjam_client_CustomVideoNative_describe(JNIEnv* env, jclass /* clazz */, jlong handle) {
    if (handle == 0) {
        return nullptr;
    }
    AHardwareBuffer_Desc desc = {};
    describeBuffer(reinterpret_cast<AHardwareBuffer*>(handle), &desc);
    if (desc.width == 0 || desc.height == 0) {
        return nullptr;
    }
    jintArray result = env->NewIntArray(2);
    if (result == nullptr) {
        return nullptr;
    }
    jint dimensions[2] = {static_cast<jint>(desc.width), static_cast<jint>(desc.height)};
    env->SetIntArrayRegion(result, 0, 2, dimensions);
    return result;
}

}  // extern "C"
