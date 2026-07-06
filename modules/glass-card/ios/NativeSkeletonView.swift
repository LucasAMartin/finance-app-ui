import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class NativeSkeletonViewProps: UIBaseViewProps {
  @Field var cornerRadius: Double = 8
  @Field var color: String = ""
}

public struct NativeSkeletonView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeSkeletonViewProps

  public init(props: NativeSkeletonViewProps) {
    self.props = props
  }

  public var body: some View {
    GeometryReader { proxy in
      let size = proxy.size
      let radius = props.cornerRadius

      SkeletonView(
        RoundedRectangle(cornerRadius: radius, style: .continuous),
        Color(hex: props.color) ?? .gray.opacity(0.3)
      )
      .frame(width: size.width, height: size.height)
    }
  }
}

struct SkeletonView<S: Shape>: View {
  var shape: S
  var color: Color
  init(_ shape: S, _ color: Color = .gray.opacity(0.3)) {
    self.shape = shape
    self.color = color
  }
  @State private var isAnimating: Bool = false
  var body: some View {
    shape
      .fill(color)
      /// Skeleton Effect
      .overlay {
        GeometryReader {
          let size = $0.size
          let skeletonWidth = size.width / 2
          /// Limiting blur radius to 30+
          let blurRadius = max(skeletonWidth / 2, 30)
          let blurDiameter = blurRadius * 2
          /// Movement Offsets
          let minX = -(skeletonWidth + blurDiameter)
          let maxX = size.width + skeletonWidth + blurDiameter

          Rectangle()
            .fill(.gray)
            .frame(width: skeletonWidth, height: size.height * 2)
            .frame(height: size.height)
            .blur(radius: blurRadius)
            .rotationEffect(.init(degrees: rotation))
            .blendMode(.softLight)
            /// Moving from left-right in-definetely
            .offset(x: isAnimating ? maxX : minX)
        }
      }
      .clipShape(shape)
      .compositingGroup()
      .task { @MainActor in
        guard !isAnimating else { return }
        withAnimation(animation) {
          isAnimating = true
        }
      }
      .onDisappear {
        /// Stopping Animation
        isAnimating = false
      }
      .transaction {
        if $0.animation != animation {
          $0.animation = .none
        }
      }
  }

  /// Customizable Properties
  var rotation: Double {
    return 5
  }

  var animation: Animation {
    .easeInOut(duration: 1.5).repeatForever(autoreverses: false)
  }
}

extension View {
  func skeleton(isRedacted: Bool) -> some View {
    self
      .modifier(SkeletonModifier(isRedacted: isRedacted))
  }
}

struct SkeletonModifier: ViewModifier {
  var isRedacted: Bool
  /// View Properties
  @State private var isAnimating: Bool = false
  @Environment(\.colorScheme) private var scheme
  func body(content: Content) -> some View {
    content
      .redacted(reason: isRedacted ? .placeholder : [])
      /// Skeleton Effect
      .overlay {
        if isRedacted {
          GeometryReader {
            let size = $0.size
            let skeletonWidth = size.width / 2
            /// Limiting blur radius to 30+
            let blurRadius = max(skeletonWidth / 2, 30)
            let blurDiameter = blurRadius * 2
            /// Movement Offsets
            let minX = -(skeletonWidth + blurDiameter)
            let maxX = size.width + skeletonWidth + blurDiameter

            Rectangle()
              .fill(scheme == .dark ? .white : .black)
              .frame(width: skeletonWidth, height: size.height * 2)
              .frame(height: size.height)
              .blur(radius: blurRadius)
              .rotationEffect(.init(degrees: rotation))
              /// Moving from left-right in-definetely
              .offset(x: isAnimating ? maxX : minX)
          }
          .mask {
            content
              .redacted(reason: .placeholder)
          }
          .blendMode(.softLight)
          .task { @MainActor in
            guard !isAnimating else { return }
            withAnimation(animation) {
              isAnimating = true
            }
          }
          .onDisappear {
            /// Stopping Animation
            isAnimating = false
          }
          .transaction {
            if $0.animation != animation {
              $0.animation = .none
            }
          }
        }
      }
  }

  /// Customizable Properties
  var rotation: Double {
    return 5
  }

  var animation: Animation {
    .easeInOut(duration: 1.5).repeatForever(autoreverses: false)
  }
}

private extension Color {
  init?(hex: String) {
    let raw = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    guard raw.count == 6 || raw.count == 8 else { return nil }

    var int: UInt64 = 0
    Scanner(string: raw).scanHexInt64(&int)

    let a: UInt64
    let r: UInt64
    let g: UInt64
    let b: UInt64

    if raw.count == 8 {
      (a, r, g, b) = ((int >> 24) & 0xff, (int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff)
    } else {
      (a, r, g, b) = (255, (int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff)
    }

    self.init(
      .sRGB,
      red: Double(r) / 255,
      green: Double(g) / 255,
      blue: Double(b) / 255,
      opacity: Double(a) / 255
    )
  }
}
