// fbjni HybridClass backing com.fishjam.webrtcworklets.FJWorkletsInstaller.
//
// Installs the JS global `__fishjamWebrtcWorklets` on the JS thread through
// the CallInvoker, then notifies the Java peer so the install Promise resolves
// only once the global exists.
#pragma once

#include <memory>

#include <ReactCommon/CallInvokerHolder.h>
#include <fbjni/fbjni.h>

#include "FJWorkletsJSI.h"

namespace fishjam::worklets {

class FJWorkletsInstallerHybrid : public facebook::jni::HybridClass<FJWorkletsInstallerHybrid> {
   public:
    static constexpr auto kJavaDescriptor = "Lcom/fishjam/webrtcworklets/FJWorkletsInstaller;";

    static facebook::jni::local_ref<jhybriddata> initHybrid(
        facebook::jni::alias_ref<jhybridobject> javaThis,
        facebook::jni::alias_ref<facebook::react::CallInvokerHolder::javaobject> callInvokerHolder);

    static void registerNatives();

    // Sets the JS global on the JS thread, then calls the Java peer's
    // onInstalled() there.
    void install();

   private:
    friend HybridBase;

    facebook::jni::global_ref<javaobject> javaPart_;
    std::shared_ptr<FJWorkletsInstaller> installer_;

    FJWorkletsInstallerHybrid(facebook::jni::alias_ref<jhybridobject> javaThis,
                              std::shared_ptr<FJWorkletsInstaller> installer);
};

}  // namespace fishjam::worklets
