import SwiftUI

private final class UserTutorialBundleToken {}

struct UserTutorialImageResource {
  let name: String
  let bundle: Bundle?

  static let pic = UserTutorialImageResource(
    name: "Pic",
    bundle: userTutorialResourceBundle()
  )
}

extension Image {
  init(_ resource: UserTutorialImageResource) {
    self.init(resource.name, bundle: resource.bundle)
  }
}

private func userTutorialResourceBundle() -> Bundle? {
  let moduleBundle = Bundle(for: UserTutorialBundleToken.self)
  let candidates = [
    moduleBundle.url(forResource: "GlassCardUserTutorial", withExtension: "bundle"),
    moduleBundle.resourceURL?.appendingPathComponent("GlassCardUserTutorial.bundle"),
    Bundle.main.url(forResource: "GlassCardUserTutorial", withExtension: "bundle"),
    Bundle.main.resourceURL?.appendingPathComponent("GlassCardUserTutorial.bundle")
  ].compactMap { $0 }

  return candidates.compactMap(Bundle.init(url:)).first
}
