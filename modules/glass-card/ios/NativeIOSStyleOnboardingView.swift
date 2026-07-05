import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeIOSStyleOnboardingViewProps: UIBaseViewProps {
  @Field var tint: Color = .blue
  @Field var hideBezels: Bool = false
  var onComplete = EventDispatcher()
}

public struct NativeIOSStyleOnboardingView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeIOSStyleOnboardingViewProps

  public init(props: NativeIOSStyleOnboardingViewProps) {
    self.props = props
  }

  public var body: some View {
#if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      IOS26StyleOnBoarding(
        tint: props.tint,
        hideBezels: props.hideBezels,
        items: ios26OnboardingItems
      ) {
        props.onComplete([:])
      }
    } else {
      IOSStyleOnboardingFallback(onComplete: {
        props.onComplete([:])
      })
    }
#else
    IOSStyleOnboardingFallback(onComplete: {
      props.onComplete([:])
    })
#endif
  }

  @available(iOS 26.0, *)
  private var ios26OnboardingItems: [IOS26StyleOnBoarding.Item] {
    [
      .init(
        id: 0,
        title: "Welcome to iOS 26",
        subtitle: "Introducing a new design with\nLiquid Glass.",
        screenshot: UIImage(named: "Screen1")
      ),
      .init(
        id: 1,
        title: "New Context Menu's",
        subtitle: "Access menu options with\ncontrols that fluidly morph.",
        screenshot: UIImage(named: "Screen2")
      ),
      .init(
        id: 2,
        title: "Floating Tab Bar",
        subtitle: "Tab bar that floats and responds\nto your hand's motion.",
        screenshot: UIImage(named: "Screen4"),
        zoomScale: 1.3,
        zoomAnchor: .init(x: 0.5, y: 1.1)
      ),
      .init(
        id: 3,
        title: "All New Photo's App",
        subtitle: "Focus on what matters with\nLiquid Glass Controls.",
        screenshot: UIImage(named: "Screen3"),
        zoomScale: 1.3,
        zoomAnchor: .init(x: 0.5, y: -0.3)
      ),
      .init(
        id: 4,
        title: "Personalized Home Screen",
        subtitle: "Personalize iPhone with new\nlooks for app icons.",
        screenshot: UIImage(named: "Screen5")
      )
    ]
  }
}

#if compiler(>=6.2)
@available(iOS 26.0, *)
private struct IOS26StyleOnBoarding: View {
  var tint: Color = .blue
  var hideBezels: Bool = false
  var items: [Item]
  var onComplete: () -> Void

  @State private var currentIndex: Int = 0
  @State private var screenshotSize: CGSize = .zero

  var body: some View {
    ZStack(alignment: .bottom) {
      ScreenshotView()
        .compositingGroup()
        .scaleEffect(
          items[currentIndex].zoomScale,
          anchor: items[currentIndex].zoomAnchor
        )
        .padding(.top, 35)
        .padding(.horizontal, 30)
        .padding(.bottom, 220)

      VStack(spacing: 10) {
        TextContentView()
        IndicatorView()
        ContinueButton()
      }
      .padding(.top, 20)
      .padding(.horizontal, 15)
      .frame(height: 210)
      .background {
        VariableGlassBlur(15)
      }

      BackButton()
    }
    .preferredColorScheme(.dark)
  }

  @ViewBuilder
  func ScreenshotView() -> some View {
    let shape = ConcentricRectangle(
      topLeadingCorner: .concentric(minimum: nil),
      topTrailingCorner: .concentric(minimum: nil),
      bottomLeadingCorner: .concentric(minimum: nil),
      bottomTrailingCorner: .concentric(minimum: nil)
    )

    GeometryReader {
      let size = $0.size

      Rectangle()
        .fill(.black)

      ScrollView(.horizontal) {
        HStack(spacing: 12) {
          ForEach(items.indices, id: \.self) { index in
            let item = items[index]

            Group {
              if let screenshot = item.screenshot {
                Image(uiImage: screenshot)
                  .resizable()
                  .aspectRatio(contentMode: .fit)
                  .onGeometryChange(for: CGSize.self) {
                    $0.size
                  } action: { newValue in
                    guard index == 0 && screenshotSize == .zero else { return }
                    screenshotSize = newValue
                  }
                  .clipShape(shape)
              } else {
                Rectangle()
                  .fill(.black)
              }
            }
            .frame(width: size.width, height: size.height)
          }
        }
        .scrollTargetLayout()
      }
      .scrollDisabled(true)
      .scrollTargetBehavior(.viewAligned)
      .scrollIndicators(.hidden)
      .scrollPosition(id: Binding<Int?>(
        get: { currentIndex },
        set: { _ in }
      ))
    }
    .clipShape(shape)
    .overlay {
      if screenshotSize != .zero && !hideBezels {
        ZStack {
          shape
            .stroke(.white, lineWidth: 6)

          shape
            .stroke(.black, lineWidth: 4)

          shape
            .stroke(.black, lineWidth: 6)
            .padding(4)
        }
        .padding(-7)
      }
    }
    .frame(
      maxWidth: screenshotSize.width == 0 ? nil : screenshotSize.width,
      maxHeight: screenshotSize.height == 0 ? nil : screenshotSize.height
    )
    .containerShape(RoundedRectangle(cornerRadius: deviceCornerRadius))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  @ViewBuilder
  func TextContentView() -> some View {
    GeometryReader {
      let size = $0.size

      ScrollView(.horizontal) {
        HStack(spacing: 0) {
          ForEach(items.indices, id: \.self) { index in
            let item = items[index]
            let isActive = currentIndex == index

            VStack(spacing: 6) {
              Text(item.title)
                .font(.title2)
                .fontWeight(.semibold)
                .lineLimit(1)
                .foregroundStyle(.white)

              Text(item.subtitle)
                .font(.callout)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.8))
            }
            .frame(width: size.width)
            .compositingGroup()
            .blur(radius: isActive ? 0 : 30)
            .opacity(isActive ? 1 : 0)
          }
        }
        .scrollTargetLayout()
      }
      .scrollIndicators(.hidden)
      .scrollDisabled(true)
      .scrollTargetBehavior(.paging)
      .scrollClipDisabled()
      .scrollPosition(id: Binding<Int?>(
        get: { currentIndex },
        set: { _ in }
      ))
    }
  }

  @ViewBuilder
  func IndicatorView() -> some View {
    HStack(spacing: 6) {
      ForEach(items.indices, id: \.self) { index in
        let isActive = currentIndex == index

        Capsule()
          .fill(.white.opacity(isActive ? 1 : 0.4))
          .frame(width: isActive ? 25 : 6, height: 6)
      }
    }
    .padding(.bottom, 5)
  }

  @ViewBuilder
  func ContinueButton() -> some View {
    Button {
      if currentIndex == items.count - 1 {
        onComplete()
      }

      withAnimation(animation) {
        currentIndex = min(currentIndex + 1, items.count - 1)
      }
    } label: {
      Text(currentIndex == items.count - 1 ? "Get Started" : "Continue")
        .fontWeight(.medium)
        .contentTransition(.numericText())
        .padding(.vertical, 6)
    }
    .tint(tint)
    .buttonStyle(.glassProminent)
    .buttonSizing(.flexible)
    .padding(.horizontal, 30)
  }

  @ViewBuilder
  func BackButton() -> some View {
    Button {
      withAnimation(animation) {
        currentIndex = max(currentIndex - 1, 0)
      }
    } label: {
      Image(systemName: "chevron.left")
        .font(.title3)
        .frame(width: 20, height: 30)
    }
    .buttonStyle(.glass)
    .buttonBorderShape(.circle)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.leading, 15)
    .padding(.top, 5)
  }

  @ViewBuilder
  func VariableGlassBlur(_ radius: CGFloat) -> some View {
    let tint: Color = .black.opacity(0.5)
    Rectangle()
      .fill(tint)
      .glassEffect(.clear, in: .rect)
      .blur(radius: radius)
      .padding([.horizontal, .bottom], -radius * 2)
      .padding(.top, -radius / 2)
      .opacity(items[currentIndex].zoomScale > 1 ? 1 : 0)
      .ignoresSafeArea()
  }

  var deviceCornerRadius: CGFloat {
    if let imageSize = items.first?.screenshot?.size {
      let ratio = screenshotSize.height / imageSize.height
      let actualCornerRadius: CGFloat = 180
      return actualCornerRadius * ratio
    }

    return 0
  }

  struct Item: Identifiable, Hashable {
    var id: Int
    var title: String
    var subtitle: String
    var screenshot: UIImage?
    var zoomScale: CGFloat = 1
    var zoomAnchor: UnitPoint = .center
  }

  var animation: Animation {
    .interpolatingSpring(duration: 0.65, bounce: 0, initialVelocity: 0)
  }
}
#endif

private struct IOSStyleOnboardingFallback: View {
  var onComplete: () -> Void

  var body: some View {
    ZStack {
      Color.black
      VStack(spacing: 16) {
        Text("iOS 26 Onboarding")
          .font(.title2)
          .fontWeight(.semibold)
          .foregroundStyle(.white)
        Text("This preview requires iOS 26.")
          .font(.callout)
          .foregroundStyle(.white.opacity(0.75))
        Button("Done", action: onComplete)
          .buttonStyle(.borderedProminent)
      }
      .padding(24)
    }
    .preferredColorScheme(.dark)
  }
}
