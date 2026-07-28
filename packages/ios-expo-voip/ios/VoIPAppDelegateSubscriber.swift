import ExpoModulesCore
import FishjamReactNativeWebrtc
import UIKit

/// Forwards the two AppDelegate events Fishjam VoIP needs into the SDK:
/// - app launch -> start the PushKit registry (required before JS loads so
///   cold-start VoIP pushes can report an incoming call)
/// - Phone-app Recents call intents -> `VoIPManager`
///
/// Gated by the `FishjamVoIPEnabled` Info.plist flag, which the
/// `@fishjam-cloud/react-native-client` config plugin writes when VoIP
/// options are enabled, without it this subscriber does nothing.
public class VoIPAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  private var voipEnabled: Bool {
    Bundle.main.object(forInfoDictionaryKey: "FishjamVoIPEnabled") as? Bool ?? false
  }

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if voipEnabled {
      VoIPManager.registerForVoIPPushes()
    }
    return true
  }

  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard voipEnabled, userActivity.activityType.hasPrefix("INStart") else {
      return false
    }
    return VoIPManager.handleContinueUserActivity(userActivity)
  }
}
