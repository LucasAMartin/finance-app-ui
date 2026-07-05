import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class NativePaywallGradientViewProps: UIBaseViewProps {}

public struct NativePaywallGradientView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativePaywallGradientViewProps

  public init(props: NativePaywallGradientViewProps) {
    self.props = props
  }

  public var body: some View {
    PaywallGradientBody()
      .ignoresSafeArea()
      .accessibilityHidden(true)
  }
}

private struct PaywallGradientBody: View {
  var body: some View {
    ZStack {
      LinearGradient(
        stops: [
          .init(color: Color(red: 0.012, green: 0.018, blue: 0.040), location: 0.00),
          .init(color: Color(red: 0.030, green: 0.042, blue: 0.105), location: 0.28),
          .init(color: Color(red: 0.030, green: 0.020, blue: 0.070), location: 0.58),
          .init(color: Color(red: 0.004, green: 0.010, blue: 0.016), location: 1.00)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )

      if #available(iOS 18.0, *) {
        MeshGradient(
          width: 4,
          height: 4,
          points: [
            SIMD2<Float>(0.00, 0.00),
            SIMD2<Float>(0.34, 0.00),
            SIMD2<Float>(0.70, 0.00),
            SIMD2<Float>(1.00, 0.00),
            SIMD2<Float>(0.00, 0.28),
            SIMD2<Float>(0.32, 0.22),
            SIMD2<Float>(0.70, 0.30),
            SIMD2<Float>(1.00, 0.26),
            SIMD2<Float>(0.00, 0.62),
            SIMD2<Float>(0.34, 0.58),
            SIMD2<Float>(0.68, 0.66),
            SIMD2<Float>(1.00, 0.58),
            SIMD2<Float>(0.00, 1.00),
            SIMD2<Float>(0.34, 1.00),
            SIMD2<Float>(0.70, 1.00),
            SIMD2<Float>(1.00, 1.00)
          ],
          colors: [
            Color(red: 0.045, green: 0.180, blue: 0.410),
            Color(red: 0.060, green: 0.470, blue: 0.680),
            Color(red: 0.470, green: 0.240, blue: 0.790),
            Color(red: 0.820, green: 0.220, blue: 0.560),
            Color(red: 0.040, green: 0.420, blue: 0.710),
            Color(red: 0.180, green: 0.760, blue: 0.820),
            Color(red: 0.670, green: 0.320, blue: 0.860),
            Color(red: 0.920, green: 0.420, blue: 0.620),
            Color(red: 0.060, green: 0.180, blue: 0.450),
            Color(red: 0.120, green: 0.600, blue: 0.600),
            Color(red: 0.360, green: 0.180, blue: 0.640),
            Color(red: 0.740, green: 0.160, blue: 0.380),
            Color(red: 0.012, green: 0.022, blue: 0.040),
            Color(red: 0.030, green: 0.160, blue: 0.150),
            Color(red: 0.060, green: 0.048, blue: 0.130),
            Color(red: 0.010, green: 0.012, blue: 0.024)
          ],
          background: Color(red: 0.010, green: 0.014, blue: 0.030),
          smoothsColors: true
        )
        .saturation(1.18)
        .blur(radius: 18)
        .opacity(0.86)
      } else {
        LinearGradient(
          stops: [
            .init(color: Color(red: 0.040, green: 0.360, blue: 0.650), location: 0.00),
            .init(color: Color(red: 0.170, green: 0.720, blue: 0.780), location: 0.25),
            .init(color: Color(red: 0.520, green: 0.260, blue: 0.780), location: 0.48),
            .init(color: Color(red: 0.700, green: 0.160, blue: 0.380), location: 0.66),
            .init(color: Color(red: 0.006, green: 0.014, blue: 0.024), location: 1.00)
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
        .blur(radius: 14)
        .opacity(0.78)
      }

      RadialGradient(
        colors: [
          Color(red: 0.760, green: 0.220, blue: 0.680).opacity(0.30),
          Color.clear
        ],
        center: UnitPoint(x: 0.74, y: 0.18),
        startRadius: 20,
        endRadius: 270
      )
      .blendMode(.screen)

      RadialGradient(
        colors: [
          Color(red: 0.160, green: 0.850, blue: 0.870).opacity(0.24),
          Color.clear
        ],
        center: UnitPoint(x: 0.10, y: 0.30),
        startRadius: 12,
        endRadius: 300
      )
      .blendMode(.screen)

      RadialGradient(
        colors: [
          Color(red: 0.050, green: 0.420, blue: 0.320).opacity(0.26),
          Color.clear
        ],
        center: UnitPoint(x: 0.48, y: 1.04),
        startRadius: 12,
        endRadius: 320
      )
      .blendMode(.screen)

      LinearGradient(
        stops: [
          .init(color: Color.black.opacity(0.16), location: 0.00),
          .init(color: Color.black.opacity(0.02), location: 0.22),
          .init(color: Color(red: 0.020, green: 0.018, blue: 0.050).opacity(0.30), location: 0.52),
          .init(color: Color.black.opacity(0.58), location: 0.78),
          .init(color: Color.black.opacity(0.86), location: 1.00)
        ],
        startPoint: .top,
        endPoint: .bottom
      )
    }
  }
}
