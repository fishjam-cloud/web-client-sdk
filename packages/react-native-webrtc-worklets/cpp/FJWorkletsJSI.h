// Installs `__fishjamWebrtcWorklets` on the main JS runtime. Its single
// function, `createConsumer(name)`, returns a FJFrameCallbackConsumer host
// object; frames are scheduled on the worklet runtime it is bound to.
#pragma once

#include <atomic>
#include <functional>
#include <memory>

#include <ReactCommon/CallInvoker.h>
#include <jsi/jsi.h>

namespace fishjam::worklets {

class FJWorkletsInstaller : public std::enable_shared_from_this<FJWorkletsInstaller> {
   public:
    explicit FJWorkletsInstaller(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
        : jsInvoker_(std::move(jsInvoker)) {}

    // Installs the global on the JS thread; `onInstalled` runs there once it exists.
    void install(std::function<void()> onInstalled);
    bool isInstalled() const { return installed_.load(); }

   private:
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker_;
    std::atomic<bool> installed_{false};
};

}  // namespace fishjam::worklets
