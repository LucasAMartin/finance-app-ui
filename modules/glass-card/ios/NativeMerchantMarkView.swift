import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeMerchantMarkViewProps: UIBaseViewProps {
  @Field var logoUrl: String?
  @Field var logoBgColor: Color?
  @Field var fallbackSystemName: String?
  @Field var fallbackColor: Color?
  @Field var fallbackBackgroundColor: Color?
  @Field var size: Double = 32
  @Field var glyphSize: Double?
  @Field var logoEnabled: Bool = true
}

public struct NativeMerchantMarkView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeMerchantMarkViewProps

  public init(props: NativeMerchantMarkViewProps) {
    self.props = props
  }

  public var body: some View {
    let size = max(CGFloat(props.size), 1)
    let fallbackColor = props.fallbackColor ?? .accentColor
    let hasRemoteLogo = props.logoEnabled && remoteURL != nil
    let fillColor = hasRemoteLogo
      ? (props.logoBgColor ?? Color.white.opacity(0.96))
      : (props.fallbackBackgroundColor ?? fallbackColor.opacity(0.15))

    ZStack {
      Circle().fill(fillColor)

      if let url = remoteURL {
        logoImage(url: url, color: fallbackColor, size: size)
      } else {
        fallbackIcon(color: fallbackColor, size: size)
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .accessibilityHidden(true)
  }

  private var remoteURL: URL? {
    guard props.logoEnabled, let logoUrl = props.logoUrl else {
      return nil
    }
    return URL(string: logoUrl)
  }

  @ViewBuilder
  private func logoImage(url: URL, color: Color, size: CGFloat) -> some View {
    if url.isFileURL, let image = localImage(url: url) {
      fittedLogo(image)
    } else {
      AsyncImage(url: url) { phase in
        switch phase {
        case .success(let image):
          fittedLogo(image)
        default:
          fallbackIcon(color: color, size: size)
        }
      }
    }
  }

  private func localImage(url: URL) -> Image? {
    guard url.isFileURL, let uiImage = UIImage(contentsOfFile: url.path) else {
      return nil
    }
    return Image(uiImage: uiImage)
  }

  private func fittedLogo(_ image: Image) -> some View {
    image
      .resizable()
      .scaledToFit()
      .padding(CGFloat(props.size) * 0.16)
  }

  private func fallbackIcon(color: Color, size: CGFloat) -> some View {
    Image(systemName: props.fallbackSystemName ?? "tag")
      .font(.system(size: CGFloat(props.glyphSize ?? Double(size * 0.47)), weight: .regular))
      .symbolRenderingMode(.monochrome)
      .foregroundStyle(color)
  }
}
