Pod::Spec.new do |s|
  s.name           = 'GlassCard'
  s.version        = '1.0.0'
  s.summary        = 'A sample project summary'
  s.description    = 'A sample project description'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '17.0',
    :tvos => '17.0'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.resource_bundles = {
    'GlassCardPaywall' => ['Resources/Paywall/*'],
    'GlassCardUserTutorial' => ['Resources/UserTutorialAssets.xcassets'],
    'GlassCardShaders' => ['LiquidLens.metal']
  }

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoUI'
  s.dependency 'SDWebImage'
  s.dependency 'SDWebImageAVIFCoder'
  s.dependency 'SDWebImageSVGCoder'
  s.dependency 'SDWebImageWebPCoder'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
