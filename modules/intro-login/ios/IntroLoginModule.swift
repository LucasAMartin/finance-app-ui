import ExpoModulesCore
import ExpoUI

public class IntroLoginModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IntroLogin")

    ExpoUIView(NativeIntroLoginNamePageView.self)
  }
}
