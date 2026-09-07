#include "FJWorkletsInstaller.h"

#include <utility>

namespace jni = facebook::jni;

namespace fishjam::worklets {

FJWorkletsInstallerHybrid::FJWorkletsInstallerHybrid(jni::alias_ref<jhybridobject> javaThis,
                                                     std::shared_ptr<FJWorkletsInstaller> installer)
    : javaPart_(jni::make_global(javaThis)), installer_(std::move(installer)) {}

jni::local_ref<FJWorkletsInstallerHybrid::jhybriddata> FJWorkletsInstallerHybrid::initHybrid(
    jni::alias_ref<jhybridobject> javaThis,
    jni::alias_ref<facebook::react::CallInvokerHolder::javaobject> callInvokerHolder) {
    auto callInvoker = callInvokerHolder->cthis()->getCallInvoker();
    return makeCxxInstance(javaThis, std::make_shared<FJWorkletsInstaller>(callInvoker));
}

void FJWorkletsInstallerHybrid::install() {
    // The callback runs on the JS thread right after the global is set, so the
    // Promise resolves strictly after JS can see it. Capturing the global_ref
    // keeps the Java peer alive until then.
    auto javaPart = javaPart_;
    installer_->install([javaPart] {
        static const auto onInstalled = javaPart->getClass()->getMethod<void()>("onInstalled");
        onInstalled(javaPart);
    });
}

void FJWorkletsInstallerHybrid::registerNatives() {
    registerHybrid({
        makeNativeMethod("initHybrid", FJWorkletsInstallerHybrid::initHybrid),
        makeNativeMethod("install", FJWorkletsInstallerHybrid::install),
    });
}

}  // namespace fishjam::worklets

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
    return facebook::jni::initialize(vm, [] { fishjam::worklets::FJWorkletsInstallerHybrid::registerNatives(); });
}
