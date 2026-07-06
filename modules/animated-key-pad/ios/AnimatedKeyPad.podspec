Pod::Spec.new do |s|
  s.name           = 'AnimatedKeyPad'
  s.version        = '1.0.0'
  s.summary        = 'Animated keypad demo bridge for finance-app'
  s.description    = 'Local Expo module that hosts the AnimatedKeyPad SwiftUI demo.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '17.0'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.resource_bundles = {
    'AnimatedKeyPadAssets' => ['Resources/AnimatedKeyPadAssets.xcassets']
  }

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoUI'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
