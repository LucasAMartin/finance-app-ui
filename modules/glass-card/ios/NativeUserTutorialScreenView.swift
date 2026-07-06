import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class NativeUserTutorialScreenViewProps: UIBaseViewProps {
  var onComplete = EventDispatcher()
}

public struct NativeUserTutorialScreenView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeUserTutorialScreenViewProps

  public init(props: NativeUserTutorialScreenViewProps) {
    self.props = props
  }

  public var body: some View {
    ContentView()
  }
}
