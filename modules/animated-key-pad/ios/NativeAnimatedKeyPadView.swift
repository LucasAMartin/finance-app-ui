import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class NativeAnimatedKeyPadViewProps: UIBaseViewProps {}

public struct NativeAnimatedKeyPadView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeAnimatedKeyPadViewProps

  public init(props: NativeAnimatedKeyPadViewProps) {
    self.props = props
  }

  public var body: some View {
    ContentView()
  }
}
