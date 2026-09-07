#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <objc/runtime.h>

#if __has_include(<React/RCTCallInvokerModule.h>)
#import <React/RCTCallInvoker.h>
#import <React/RCTCallInvokerModule.h>
#define FJ_HAS_CALL_INVOKER 1
#endif

#include <memory>

#include "FJWorkletsJSI.h"

// ObjC holder for the C++ installer, stored on the module as an associated object.
@interface FJWorkletsInstallerBox : NSObject {
   @public
    std::shared_ptr<fishjam::worklets::FJWorkletsInstaller> installer;
}
@end

@implementation FJWorkletsInstallerBox
@end

#if FJ_HAS_CALL_INVOKER
@interface FishjamWebrtcWorkletsModule : NSObject <RCTBridgeModule, RCTCallInvokerModule>
@property(nonatomic, nullable) RCTCallInvoker *callInvoker;
#else
@interface FishjamWebrtcWorkletsModule : NSObject <RCTBridgeModule>
#endif
@end

@implementation FishjamWebrtcWorkletsModule

RCT_EXPORT_MODULE(FishjamWebrtcWorklets)

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (FJWorkletsInstallerBox *)fj_installerBox {
#if FJ_HAS_CALL_INVOKER
    static const void *key = &key;
    FJWorkletsInstallerBox *box = objc_getAssociatedObject(self, key);
    if (box != nil) {
        return box;
    }
    RCTCallInvoker *invoker = self.callInvoker;
    if (invoker == nil) {
        return nil;
    }
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker = [invoker callInvoker];
    if (!jsInvoker) {
        return nil;
    }
    box = [FJWorkletsInstallerBox new];
    box->installer = std::make_shared<fishjam::worklets::FJWorkletsInstaller>(jsInvoker);
    objc_setAssociatedObject(self, key, box, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return box;
#else
    return nil;
#endif
}

RCT_REMAP_METHOD(install, installWithResolver : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject) {
    FJWorkletsInstallerBox *box = [self fj_installerBox];
    if (box == nil) {
        reject(@"E_NO_JSI", @"Camera frame worklets require the New Architecture.", nil);
        return;
    }
    box->installer->install([resolve]() { resolve(nil); });
}

@end
