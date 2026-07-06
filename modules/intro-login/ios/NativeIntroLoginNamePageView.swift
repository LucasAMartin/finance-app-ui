import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class NativeIntroLoginNamePageViewProps: UIBaseViewProps {
  @Field var initialName: String = ""
  @Field var profileImageDataUri: String = ""
  var onNameChange = EventDispatcher()
}

public struct NativeIntroLoginNamePageView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeIntroLoginNamePageViewProps

  public init(props: NativeIntroLoginNamePageViewProps) {
    self.props = props
  }

  public var body: some View {
    Home(
      initialName: props.initialName,
      profileImageDataUri: props.profileImageDataUri
    ) { name in
      props.onNameChange(["name": name])
    }
  }
}
