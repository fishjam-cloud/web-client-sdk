// The JS view of one camera frame, handed to the frame callback on the camera
// runtime. Holds the frame until `release()` is called or the callback returns,
// whichever comes first; after that every field reads as undefined.
#pragma once

#include <memory>
#include <mutex>
#include <vector>

#include <jsi/jsi.h>

#include "FJCameraFrame.h"

namespace fishjam::worklets {

class FJCameraFrameHostObject : public facebook::jsi::HostObject {
   public:
    explicit FJCameraFrameHostObject(std::shared_ptr<fishjam::video::FJCameraFrame> frame) : frame_(std::move(frame)) {}

    facebook::jsi::Value get(facebook::jsi::Runtime &rt, const facebook::jsi::PropNameID &name) override;
    std::vector<facebook::jsi::PropNameID> getPropertyNames(facebook::jsi::Runtime &rt) override;

    // Drops the frame, which returns its buffer to the camera. Safe to repeat.
    void release();

   private:
    std::mutex mutex_;
    std::shared_ptr<fishjam::video::FJCameraFrame> frame_;
};

}  // namespace fishjam::worklets
