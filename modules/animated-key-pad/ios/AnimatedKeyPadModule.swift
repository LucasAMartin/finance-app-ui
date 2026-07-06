import ExpoModulesCore
import ExpoUI

public class AnimatedKeyPadModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AnimatedKeyPad")

    ExpoUIView(NativeAnimatedKeyPadView.self)
  }
}
