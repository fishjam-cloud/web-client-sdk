#include "FJFrameCallbackConsumer.h"

#include <atomic>
#include <exception>
#include <string>
#include <utility>

#ifdef __ANDROID__
#include <android/log.h>
#include <poll.h>

#include <cerrno>
#endif

#include <worklets/Registries/WorkletRuntimeRegistry.h>
#include <worklets/WorkletRuntime/WorkletRuntime.h>

#include "FJCameraFrameHostObject.h"

namespace jsi = facebook::jsi;
using fishjam::video::FJCameraFrame;
using fishjam::video::kFJCameraFrameConsumerTag;

namespace fishjam::worklets {

namespace {

#ifdef __ANDROID__
constexpr int kAcquireFenceTimeoutMilliseconds = 2000;
constexpr int kAcquireFenceLogEveryNthFailure = 300;

// Blocks until the GPU has finished writing the frame's buffer. The fence is a
// sync file, which becomes readable once signalled; the frame keeps ownership of
// the descriptor.
bool waitForAcquireFence(const FJCameraFrame &frame) {
    if (frame.acquireFenceFileDescriptor < 0) {
        return true;
    }
    pollfd descriptor{frame.acquireFenceFileDescriptor, POLLIN, 0};
    int result;
    do {
        result = poll(&descriptor, 1, kAcquireFenceTimeoutMilliseconds);
    } while (result < 0 && errno == EINTR);
    bool signalled = result > 0 && (descriptor.revents & POLLIN) != 0;
    if (!signalled) {
        static std::atomic<int> failureCount{0};
        int failures = ++failureCount;
        if (failures <= 5 || failures % kAcquireFenceLogEveryNthFailure == 0) {
            __android_log_print(ANDROID_LOG_WARN, "FishjamWebrtcWorklets",
                                "Camera frame acquire fence %s (%d so far); dropping the frame",
                                result == 0 ? "timed out" : "failed", failures);
        }
    }
    return signalled;
}
#else
bool waitForAcquireFence(const FJCameraFrame &) {
    return true;
}
#endif

bool isRuntimeAlive(jsi::Runtime *runtime) {
    bool alive = false;
    ::worklets::WorkletRuntimeRegistry::runWhileLocked(runtime, [&alive](bool isAlive) { alive = isAlive; });
    return alive;
}

void reportError(jsi::Runtime &rt, const std::string &message) {
    try {
        jsi::Object console = rt.global().getPropertyAsObject(rt, "console");
        console.getPropertyAsFunction(rt, "error").call(rt, jsi::String::createFromUtf8(rt, message));
    } catch (...) {
        // Nothing left to report to.
    }
}

}  // namespace

FJFrameCallbackConsumer::~FJFrameCallbackConsumer() {
    forgetCallback();
}

void FJFrameCallbackConsumer::forgetCallback() {
    std::lock_guard<std::mutex> lock(callbackMutex_);
    if (callback_ && !isRuntimeAlive(callbackRuntime_)) {
        // Releasing a JSI value on a runtime that is gone would touch freed
        // memory; leaking it is the lesser evil, and the runtime took the
        // function with it anyway.
        callback_.release();
    }
    callback_.reset();
    callbackRuntime_ = nullptr;
}

jsi::Value FJFrameCallbackConsumer::get(jsi::Runtime &rt, const jsi::PropNameID &name) {
    std::string property = name.utf8(rt);
    if (property == kFJCameraFrameConsumerTag) {
        return jsi::Value(true);
    }
    if (property == "bindRuntime") {
        return jsi::Function::createFromHostFunction(
            rt, name, 1, [this](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
                if (count == 0) {
                    throw jsi::JSError(rt, "bindRuntime expects the camera worklet runtime.");
                }
                bindRuntime(rt, args[0]);
                return jsi::Value::undefined();
            });
    }
    if (property == "setCallback") {
        return jsi::Function::createFromHostFunction(
            rt, name, 1, [this](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) -> jsi::Value {
                if (count > 0) {
                    setCallback(rt, args[0]);
                } else {
                    forgetCallback();
                }
                return jsi::Value::undefined();
            });
    }
    if (property == "clearCallback") {
        return jsi::Function::createFromHostFunction(
            rt, name, 0, [this](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) -> jsi::Value {
                forgetCallback();
                return jsi::Value::undefined();
            });
    }
    return jsi::Value::undefined();
}

std::vector<jsi::PropNameID> FJFrameCallbackConsumer::getPropertyNames(jsi::Runtime &rt) {
    return jsi::PropNameID::names(rt, kFJCameraFrameConsumerTag, "bindRuntime", "setCallback", "clearCallback");
}

void FJFrameCallbackConsumer::bindRuntime(jsi::Runtime &rt, const jsi::Value &workletRuntime) {
    if (!workletRuntime.isObject() || !workletRuntime.getObject(rt).isHostObject(rt)) {
        throw jsi::JSError(rt, "bindRuntime expects the WorkletRuntime returned by createWorkletRuntime.");
    }
    std::shared_ptr<::worklets::WorkletRuntime> runtime = ::worklets::extractWorkletRuntime(rt, workletRuntime);
    if (!runtime) {
        throw jsi::JSError(rt, "bindRuntime expects the WorkletRuntime returned by createWorkletRuntime.");
    }
    std::lock_guard<std::mutex> lock(runtimeMutex_);
    runtime_ = std::move(runtime);
}

void FJFrameCallbackConsumer::setCallback(jsi::Runtime &rt, const jsi::Value &callback) {
    if (!callback.isObject() || !callback.getObject(rt).isFunction(rt)) {
        forgetCallback();
        return;
    }
    std::lock_guard<std::mutex> lock(callbackMutex_);
    callback_ = std::make_unique<jsi::Function>(callback.getObject(rt).getFunction(rt));
    callbackRuntime_ = &rt;
}

void FJFrameCallbackConsumer::onFrame(std::shared_ptr<FJCameraFrame> frame) {
    {
        std::lock_guard<std::mutex> lock(callbackMutex_);
        if (!callback_) {
            // Dropping the frame here hands it straight back to the camera.
            return;
        }
    }
    std::shared_ptr<::worklets::WorkletRuntime> runtime;
    {
        std::lock_guard<std::mutex> lock(runtimeMutex_);
        runtime = runtime_;
    }
    if (!runtime) {
        return;
    }
    // The job runs on the runtime's own thread with its lock held, the same
    // way a scheduled worklet does.
    runtime->schedule([self = shared_from_this(), frame = std::move(frame)](jsi::Runtime &rt) mutable {
        self->deliver(rt, std::move(frame));
    });
}

void FJFrameCallbackConsumer::deliver(jsi::Runtime &rt, std::shared_ptr<FJCameraFrame> frame) {
    if (!waitForAcquireFence(*frame)) {
        // Dropping the frame returns its buffer to the camera.
        return;
    }
    std::lock_guard<std::mutex> lock(callbackMutex_);
    if (!callback_ || callbackRuntime_ != &rt) {
        return;
    }
    auto hostFrame = std::make_shared<FJCameraFrameHostObject>(std::move(frame));
    try {
        callback_->call(rt, jsi::Object::createFromHostObject(rt, hostFrame));
    } catch (const jsi::JSError &error) {
        reportError(rt, "Camera frame callback failed: " + error.getMessage());
    } catch (const std::exception &error) {
        reportError(rt, std::string("Camera frame callback failed: ") + error.what());
    }
    // The buffer goes back to the camera when the callback returns, whatever JS
    // kept of the frame object.
    hostFrame->release();
}

}  // namespace fishjam::worklets
