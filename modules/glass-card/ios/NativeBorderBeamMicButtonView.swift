import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeBorderBeamMicButtonViewProps: UIBaseViewProps {
  @Field var isDark: Bool = false
  @Field var systemName: String = "mic.fill"
  @Field var size: Double = 88
  @Field var iconSize: Double = 32
  @Field var accessibilityLabelText: String = "Start recording"
  var onMicPress = EventDispatcher()
}

public struct NativeBorderBeamMicButtonView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeBorderBeamMicButtonViewProps

  public init(props: NativeBorderBeamMicButtonViewProps) {
    self.props = props
  }

  public var body: some View {
    if #available(iOS 17.0, *) {
      BorderBeamMicButtonContent(
        isDark: props.isDark,
        systemName: props.systemName,
        size: CGFloat(props.size),
        iconSize: CGFloat(props.iconSize),
        accessibilityLabelText: props.accessibilityLabelText,
        onPress: { props.onMicPress([:]) }
      )
    } else {
      BorderBeamMicButtonFallback(
        isDark: props.isDark,
        systemName: props.systemName,
        size: CGFloat(props.size),
        iconSize: CGFloat(props.iconSize),
        accessibilityLabelText: props.accessibilityLabelText,
        onPress: { props.onMicPress([:]) }
      )
    }
  }
}

@available(iOS 17.0, *)
private struct BorderBeamMicButtonContent: View {
  let isDark: Bool
  let systemName: String
  let size: CGFloat
  let iconSize: CGFloat
  let accessibilityLabelText: String
  let onPress: () -> Void

  var body: some View {
    let buttonColor = isDark ? Color.white : Color.black
    let iconColor = isDark ? Color.black : Color.white

    Button(action: onPress) {
      Image(systemName: systemName)
        .font(.system(size: iconSize, weight: .semibold))
        .foregroundStyle(iconColor)
        .frame(width: size, height: size)
        .borderBeam(
          border: .white,
          beam: [.green, .blue, .pink, .orange, .indigo],
          beamBlur: 15,
          cornerRadius: size / 2,
          isEnabled: true
        )
        .background(buttonColor, in: .circle)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(accessibilityLabelText))
    .frame(width: size, height: size)
  }
}

private struct BorderBeamMicButtonFallback: View {
  let isDark: Bool
  let systemName: String
  let size: CGFloat
  let iconSize: CGFloat
  let accessibilityLabelText: String
  let onPress: () -> Void

  var body: some View {
    let buttonColor = isDark ? Color.white : Color.black
    let iconColor = isDark ? Color.black : Color.white

    Button(action: onPress) {
      Image(systemName: systemName)
        .font(.system(size: iconSize, weight: .semibold))
        .foregroundStyle(iconColor)
        .frame(width: size, height: size)
        .background(buttonColor, in: .circle)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(accessibilityLabelText))
    .frame(width: size, height: size)
  }
}
