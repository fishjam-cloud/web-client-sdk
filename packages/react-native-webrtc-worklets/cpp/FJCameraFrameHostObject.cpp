#include "FJCameraFrameHostObject.h"

#include <string>

namespace jsi = facebook::jsi;
using fishjam::video::FJCameraPixelFormat;

namespace fishjam::worklets {

namespace {

const char *pixelFormatName(FJCameraPixelFormat format) {
    switch (format) {
        case FJCameraPixelFormat::NV12:
            return "nv12";
        case FJCameraPixelFormat::BGRA8:
            return "bgra8";
        case FJCameraPixelFormat::RGBA8:
            return "rgba8";
        case FJCameraPixelFormat::Unknown:
        default:
            return "unknown";
    }
}

}  // namespace

void FJCameraFrameHostObject::release() {
    std::lock_guard<std::mutex> lock(mutex_);
    frame_.reset();
}

jsi::Value FJCameraFrameHostObject::get(jsi::Runtime &rt, const jsi::PropNameID &name) {
    std::string property = name.utf8(rt);
    if (property == "release") {
        return jsi::Function::createFromHostFunction(
            rt, name, 0, [this](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) -> jsi::Value {
                release();
                return jsi::Value::undefined();
            });
    }

    std::lock_guard<std::mutex> lock(mutex_);
    if (property == "isReleased") {
        return jsi::Value(frame_ == nullptr);
    }
    if (!frame_) {
        return jsi::Value::undefined();
    }
    if (property == "nativeBuffer") {
        return jsi::BigInt::fromUint64(rt, frame_->nativeBuffer);
    }
    if (property == "width") {
        return jsi::Value(frame_->width);
    }
    if (property == "height") {
        return jsi::Value(frame_->height);
    }
    if (property == "rotationDegrees") {
        return jsi::Value(frame_->rotationDegrees);
    }
    if (property == "isFrontCamera") {
        return jsi::Value(frame_->isFrontCamera);
    }
    if (property == "timestampNanoseconds") {
        return jsi::Value(static_cast<double>(frame_->timestampNanoseconds));
    }
    if (property == "pixelFormat") {
        return jsi::String::createFromAscii(rt, pixelFormatName(frame_->pixelFormat));
    }
    return jsi::Value::undefined();
}

std::vector<jsi::PropNameID> FJCameraFrameHostObject::getPropertyNames(jsi::Runtime &rt) {
    return jsi::PropNameID::names(rt, "nativeBuffer", "width", "height", "rotationDegrees", "isFrontCamera",
                                  "timestampNanoseconds", "pixelFormat", "isReleased", "release");
}

}  // namespace fishjam::worklets
