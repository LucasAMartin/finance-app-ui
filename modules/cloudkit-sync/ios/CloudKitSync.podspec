Pod::Spec.new do |s|
  s.name           = 'CloudKitSync'
  s.version        = '1.0.0'
  s.summary        = 'CloudKit sync bridge for finance-app'
  s.description    = 'Local Expo module that bridges CloudKit ledger sync to React Native.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
