require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# The fork's public C++ contract (FJCameraFrame.h) is included straight from its
# sources, resolved the way Metro resolves the package, so it never has to enter
# the fork's Objective-C umbrella header.
webrtc_package_json = `node --print "require.resolve('@fishjam-cloud/react-native-webrtc/package.json', { paths: ['#{__dir__}'] })"`.strip
webrtc_dir = File.dirname(webrtc_package_json)

Pod::Spec.new do |s|
  s.name                = 'FishjamReactNativeWebrtcWorklets'
  s.version             = package['version']
  s.summary             = package['description']
  s.homepage            = package['homepage']
  s.license             = package['license']
  s.author              = { 'Fishjam Cloud' => 'https://github.com/fishjam-cloud' }
  s.source              = { :git => 'https://github.com/fishjam-cloud/web-client-sdk.git', :tag => s.version.to_s }
  s.platforms           = { :ios => '13.4' }
  s.requires_arc        = true

  s.source_files        = 'ios/**/*.{h,m,mm}', 'cpp/**/*.{h,cpp}'
  s.private_header_files = 'cpp/**/*.h'

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'HEADER_SEARCH_PATHS' => [
      '"$(PODS_TARGET_SRCROOT)/cpp"',
      "\"#{webrtc_dir}/common/cpp/fishjam-video/public\"",
      '"$(PODS_ROOT)/Headers/Public/RNWorklets"',
    ].join(' '),
  }

  s.dependency 'React-Core'
  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  # WorkletRuntime.h pulls in the cxxreact and jsiexecutor headers.
  s.dependency 'React-cxxreact'
  s.dependency 'React-jsiexecutor'
  s.dependency 'React-debug'
  s.dependency 'RNWorklets'
  s.dependency 'FishjamReactNativeWebrtc'
  install_modules_dependencies(s)
end
