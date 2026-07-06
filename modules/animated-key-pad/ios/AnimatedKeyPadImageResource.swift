import Foundation
import SwiftUI

private final class AnimatedKeyPadBundleToken {}

private let animatedKeyPadResourceBundle: Bundle = {
  let moduleBundle = Bundle(for: AnimatedKeyPadBundleToken.self)
  let candidates = [
    moduleBundle.url(forResource: "AnimatedKeyPadAssets", withExtension: "bundle"),
    moduleBundle.resourceURL?.appendingPathComponent("AnimatedKeyPadAssets.bundle"),
    Bundle.main.url(forResource: "AnimatedKeyPadAssets", withExtension: "bundle"),
    Bundle.main.resourceURL?.appendingPathComponent("AnimatedKeyPadAssets.bundle")
  ].compactMap { $0 }

  return candidates.compactMap(Bundle.init(url:)).first ?? moduleBundle
}()

@available(iOS 11.0, macOS 10.7, tvOS 11.0, *)
extension ImageResource {
  static let pic = ImageResource(name: "Pic", bundle: animatedKeyPadResourceBundle)
}
