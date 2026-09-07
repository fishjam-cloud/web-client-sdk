#include "FJWorkletsJSI.h"

#include <string>
#include <utility>

#include "FJFrameCallbackConsumer.h"

namespace jsi = facebook::jsi;

namespace fishjam::worklets {

namespace {

jsi::Value createConsumer(jsi::Runtime &rt, const jsi::Value *, size_t) {
    return jsi::Object::createFromHostObject(rt, std::make_shared<FJFrameCallbackConsumer>());
}

}  // namespace

void FJWorkletsInstaller::install(std::function<void()> onInstalled) {
    std::weak_ptr<FJWorkletsInstaller> weakSelf = weak_from_this();
    jsInvoker_->invokeAsync([weakSelf, onInstalled = std::move(onInstalled)](jsi::Runtime &rt) {
        auto self = weakSelf.lock();
        if (!self) {
            return;
        }
        // Always (re)define the global: a JS reload replaces the runtime while
        // this installer survives on Android, so the new runtime needs it again.
        jsi::Object api(rt);
        api.setProperty(rt, "createConsumer",
                        jsi::Function::createFromHostFunction(
                            rt, jsi::PropNameID::forAscii(rt, "createConsumer"), 0,
                            [](jsi::Runtime &rt, const jsi::Value &, const jsi::Value *args, size_t count) {
                                return createConsumer(rt, args, count);
                            }));
        rt.global().setProperty(rt, "__fishjamWebrtcWorklets", api);
        self->installed_.store(true);
        if (onInstalled) {
            onInstalled();
        }
    });
}

}  // namespace fishjam::worklets
