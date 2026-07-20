require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'FishjamExpoVoip'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = package['license']
  s.author         = { 'Fishjam Cloud' => 'https://github.com/fishjam-cloud' }
  s.homepage       = package['homepage']
  s.source         = { :git => 'https://github.com/fishjam-cloud/web-client-sdk.git', :tag => s.version.to_s }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.0'

  s.dependency 'ExpoModulesCore'
  s.dependency 'FishjamReactNativeWebrtc'

  s.source_files = '**/*.swift'
end
