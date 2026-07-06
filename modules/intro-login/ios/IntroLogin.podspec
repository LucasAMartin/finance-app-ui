Pod::Spec.new do |s|
  s.name           = 'IntroLogin'
  s.version        = '1.0.0'
  s.summary        = 'Intro login onboarding bridge for finance-app'
  s.description    = 'Local Expo module that hosts the Intro+Login SwiftUI onboarding page.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '17.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.resource_bundles = {
    'IntroLoginAssets' => ['Resources/IntroLoginAssets.xcassets']
  }

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoUI'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
