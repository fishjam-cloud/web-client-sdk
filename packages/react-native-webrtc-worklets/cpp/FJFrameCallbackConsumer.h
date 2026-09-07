// Bridges the fork's camera frame processor to a worklet: each admitted frame
// becomes a job scheduled on the camera worklet runtime that calls the
// registered callback with a FJCameraFrameHostObject.
//
// One object plays two roles. Towards the fork it is the FJCameraFrameConsumer
// handed to `CameraFrameProcessor.attach`. Towards JS it is the host object that
// `attach` receives and that the worklet calls `setCallback` on — a host object
// because react-native-worklets passes those between runtimes by reference.
//
// Frames travel on the runtime's own queue (`WorkletRuntime::schedule`) rather
// than a queue we supply: a custom AsyncQueue is recognised through a
// dynamic_cast inside libworklets, which fails across shared-library
// boundaries on Android.
#pragma once

#include <memory>
#include <mutex>
#include <vector>

#include <jsi/jsi.h>

#include "FJCameraFrame.h"

namespace worklets {
class WorkletRuntime;
}

namespace fishjam::worklets {

class FJFrameCallbackConsumer : public fishjam::video::FJCameraFrameConsumerHostObject,
                                public fishjam::video::FJCameraFrameConsumer,
                                public std::enable_shared_from_this<FJFrameCallbackConsumer> {
   public:
    FJFrameCallbackConsumer() = default;
    ~FJFrameCallbackConsumer() override;

    // FJCameraFrameConsumerHostObject
    std::shared_ptr<fishjam::video::FJCameraFrameConsumer> consumer() override { return shared_from_this(); }
    facebook::jsi::Value get(facebook::jsi::Runtime &rt, const facebook::jsi::PropNameID &name) override;
    std::vector<facebook::jsi::PropNameID> getPropertyNames(facebook::jsi::Runtime &rt) override;

    // FJCameraFrameConsumer; called on the capture thread.
    void onFrame(std::shared_ptr<fishjam::video::FJCameraFrame> frame) override;

   private:
    // Called on the JS thread with the WorkletRuntime host object returned by
    // `createWorkletRuntime`; frames are scheduled on that runtime from then on.
    void bindRuntime(facebook::jsi::Runtime &rt, const facebook::jsi::Value &workletRuntime);
    // Both run on the camera runtime's thread, the only thread that may touch
    // that runtime: `setCallback` is invoked from a worklet scheduled there and
    // `deliver` from a job scheduled by `onFrame`.
    void setCallback(facebook::jsi::Runtime &rt, const facebook::jsi::Value &callback);
    void deliver(facebook::jsi::Runtime &rt, std::shared_ptr<fishjam::video::FJCameraFrame> frame);
    void forgetCallback();

    // A strong reference: the camera worklet runtime is created once for the
    // app and never destroyed, and its only other owner is a JS handle that
    // Hermes may collect. Holding it here keeps the runtime and its thread
    // alive for as long as frames may arrive.
    std::mutex runtimeMutex_;
    std::shared_ptr<::worklets::WorkletRuntime> runtime_;
    std::mutex callbackMutex_;
    facebook::jsi::Runtime *callbackRuntime_ = nullptr;
    std::unique_ptr<facebook::jsi::Function> callback_;
};

}  // namespace fishjam::worklets
