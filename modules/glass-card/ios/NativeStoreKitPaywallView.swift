import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeStoreKitPaywallViewProps: UIBaseViewProps {
  @Field var appName: String = "App Name"
  @Field var title: String = "Membership"
  @Field var subtitle: String = "Lorem Ipsum is simply dummy text\nof the printing and typesetting industry."
  @Field var ctaLabel: String = "Start 30 Day Free Trial"
  @Field var plansJSON: String = "[]"
  @Field var isBusy: Bool = false
  var onClose = EventDispatcher()
  var onSubscribe = EventDispatcher()
  var onRestore = EventDispatcher()
}

public struct NativeStoreKitPaywallView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeStoreKitPaywallViewProps

  public init(props: NativeStoreKitPaywallViewProps) {
    self.props = props
  }

  public var body: some View {
    StoreKitPaywallContentView(
      appName: props.appName,
      title: props.title,
      subtitle: props.subtitle,
      ctaLabel: props.ctaLabel,
      plans: decodePlans(props.plansJSON),
      isBusy: props.isBusy,
      onClose: { props.onClose([:]) },
      onSubscribe: { packageID in props.onSubscribe(["packageID": packageID]) },
      onRestore: { props.onRestore([:]) }
    )
  }

  private func decodePlans(_ json: String) -> [StoreKitPaywallPlan] {
    guard let data = json.data(using: .utf8),
          let plans = try? JSONDecoder().decode([StoreKitPaywallPlan].self, from: data),
          !plans.isEmpty
    else {
      return StoreKitPaywallPlan.defaults
    }

    return plans
  }
}

private struct StoreKitPaywallPlan: Codable, Identifiable, Equatable {
  let id: String
  let title: String
  let price: String
  let cadence: String
  let badge: String?
  let detail: String

  static let defaults = [
    StoreKitPaywallPlan(
      id: "pro_weekly",
      title: "Weekly",
      price: "$0.99",
      cadence: "/week",
      badge: nil,
      detail: "Subscribe for a Week"
    ),
    StoreKitPaywallPlan(
      id: "pro_monthly",
      title: "Change Plan to Monthly",
      price: "$2.99",
      cadence: "/month",
      badge: nil,
      detail: "Subscribe for a Month"
    ),
    StoreKitPaywallPlan(
      id: "pro_yearly",
      title: "Yearly",
      price: "$12.99",
      cadence: "/year",
      badge: nil,
      detail: "Subscribe for a Year"
    )
  ]
}

private enum IAPImage: String, CaseIterable {
  case one = "IAP1"
  case two = "IAP2"
  case three = "IAP3"
  case four = "IAP4"
}

private struct StoreKitPaywallContentView: View {
  let appName: String
  let title: String
  let subtitle: String
  let ctaLabel: String
  let plans: [StoreKitPaywallPlan]
  let isBusy: Bool
  let onClose: () -> Void
  let onSubscribe: (String) -> Void
  let onRestore: () -> Void

  @State private var selectedPlanID: String = StoreKitPaywallPlan.defaults[0].id
  @State private var scrollPlanID: String? = StoreKitPaywallPlan.defaults[0].id

  var selectedIndex: Int {
    plans.firstIndex(where: { $0.id == selectedPlanID }) ?? 0
  }

  var selectedPlan: StoreKitPaywallPlan {
    plans.first(where: { $0.id == selectedPlanID }) ?? plans[0]
  }

  var body: some View {
    GeometryReader { proxy in
      let size = proxy.size
      let isSmalleriPhone = size.height < 700
      let safeBottom = proxy.safeAreaInsets.bottom
      let cardWidth = min(size.width * 0.66, 270)
      let cardHeight: CGFloat = isSmalleriPhone ? 116 : 136
      let legalBottom = safeBottom + 10

      VStack(spacing: 0) {
        CustomMarketingView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        CustomSubscriptionStyle(cardWidth: cardWidth, cardHeight: cardHeight, isSmalleriPhone: isSmalleriPhone)
          .offset(y: 12)
          .padding(.bottom, 12)

        HStack(spacing: 3) {
          Button("Terms of Service", action: onClose)
          Text("And")
          Button("Privacy Policy", action: onClose)
        }
        .font(.caption)
        .foregroundStyle(.white.opacity(0.56))
        .buttonStyle(.plain)
        .padding(.bottom, legalBottom)
      }
      .frame(width: size.width, height: size.height)
      .background(BackdropView())
      .onAppear {
        if !plans.contains(where: { $0.id == selectedPlanID }) {
          selectedPlanID = plans[0].id
          scrollPlanID = plans[0].id
        } else {
          scrollPlanID = selectedPlanID
        }
      }
    }
    .environment(\.colorScheme, .dark)
    .tint(.white)
  }

  @ViewBuilder
  func BackdropView() -> some View {
    GeometryReader {
      let size = $0.size

      if let image = StoreKitPaywallAssets.image(named: "IAP4") {
        Image(uiImage: image)
          .resizable()
          .aspectRatio(contentMode: .fill)
          .frame(width: size.width, height: size.height)
          .scaleEffect(1.5)
          .blur(radius: 70, opaque: true)
          .overlay {
            Rectangle()
              .fill(.black.opacity(0.2))
          }
      } else {
        Color.black
      }
    }
    .ignoresSafeArea()
  }

  @ViewBuilder
  func CustomMarketingView() -> some View {
    VStack(spacing: 15) {
      HStack(spacing: 25) {
        ScreenshotsView([.one, .two, .three], offset: -200)
        ScreenshotsView([.four, .one, .two], offset: -350)
        ScreenshotsView([.two, .three, .one], offset: -250)
          .overlay(alignment: .trailing) {
            ScreenshotsView([.four, .two, .one], offset: -150)
              .offset(x: 142)
          }
      }
      .frame(maxHeight: .infinity)
      .offset(x: 20)
      .mask {
        LinearGradient(colors: [
          .white,
          .white.opacity(0.9),
          .white.opacity(0.7),
          .white.opacity(0.4),
          .clear
        ], startPoint: .top, endPoint: .bottom)
        .ignoresSafeArea()
        .padding(.bottom, -40)
      }

      VStack(spacing: 6) {
        Text(appName)
          .font(.title3)

        Text(title)
          .font(.largeTitle.bold())

        Text(subtitle)
          .font(.callout)
          .multilineTextAlignment(.center)
          .lineLimit(2)
          .fixedSize(horizontal: false, vertical: true)
      }
      .foregroundStyle(.white)
      .padding(.top, 15)
      .padding(.bottom, 18)
      .padding(.horizontal, 15)
    }
  }

  @ViewBuilder
  func CustomSubscriptionStyle(cardWidth: CGFloat, cardHeight: CGFloat, isSmalleriPhone: Bool) -> some View {
    VStack(spacing: 25) {
      PlanPicker(cardWidth: cardWidth, cardHeight: cardHeight)
        .frame(height: cardHeight)

      VStack(spacing: isSmalleriPhone ? 8 : 10) {
        HStack(spacing: 10) {
          ForEach(plans.indices, id: \.self) { index in
            Circle()
              .fill(index == selectedIndex ? .white : .white.opacity(0.34))
              .frame(width: index == selectedIndex ? 8 : 7, height: index == selectedIndex ? 8 : 7)
          }
        }

        Text("Plan auto-renews until canceled.")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.white.opacity(0.48))
      }

      Button {
        onSubscribe(selectedPlan.id)
      } label: {
        ZStack {
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(Color.white.opacity(isBusy ? 0.72 : 0.84))

          if isBusy {
            ProgressView()
              .tint(Color(red: 0.06, green: 0.07, blue: 0.10))
          } else {
            Text(ctaLabel)
              .font(.title3.weight(.medium))
              .foregroundStyle(Color(red: 0.06, green: 0.07, blue: 0.10))
              .lineLimit(1)
              .minimumScaleFactor(0.78)
          }
        }
        .frame(height: 56)
      }
      .buttonStyle(.plain)
      .disabled(isBusy)
      .padding(.horizontal, 33)

      Button(action: onRestore) {
        Text("Restore Subscription")
          .font(.headline.weight(.bold))
          .foregroundStyle(.white)
          .opacity(isBusy ? 0.55 : 1)
      }
      .buttonStyle(.plain)
      .disabled(isBusy)
    }
  }

  @ViewBuilder
  func PlanPicker(cardWidth: CGFloat, cardHeight: CGFloat) -> some View {
    if #available(iOS 17.0, *) {
      ScrollView(.horizontal) {
        HStack(spacing: 25) {
          ForEach(plans) { plan in
            PlanCard(
              plan: plan,
              selected: selectedPlanID == plan.id,
              width: cardWidth,
              height: cardHeight,
              onSelect: {
                selectedPlanID = plan.id
                scrollPlanID = plan.id
              }
            )
            .id(plan.id)
          }
        }
        .scrollTargetLayout()
        .padding(.horizontal, 34)
      }
      .scrollIndicators(.hidden)
      .scrollTargetBehavior(.viewAligned)
      .scrollPosition(id: $scrollPlanID)
      .onChange(of: scrollPlanID) { newValue in
        if let newValue {
          selectedPlanID = newValue
        }
      }
    } else {
      ScrollView(.horizontal) {
        HStack(spacing: 25) {
          ForEach(plans) { plan in
            PlanCard(
              plan: plan,
              selected: selectedPlanID == plan.id,
              width: cardWidth,
              height: cardHeight,
              onSelect: { selectedPlanID = plan.id }
            )
          }
        }
        .padding(.horizontal, 34)
      }
      .scrollIndicators(.hidden)
    }
  }

  @ViewBuilder
  func ScreenshotsView(_ content: [IAPImage], offset: CGFloat) -> some View {
    ScrollView(.vertical) {
      VStack(spacing: 10) {
        ForEach(content.indices, id: \.self) { index in
          if let image = StoreKitPaywallAssets.image(named: content[index].rawValue) {
            Image(uiImage: image)
              .resizable()
              .aspectRatio(contentMode: .fit)
          }
        }
      }
      .offset(y: offset)
    }
    .scrollDisabled(true)
    .scrollIndicators(.hidden)
    .rotationEffect(.init(degrees: -30), anchor: .bottom)
    .paywallScrollClipDisabled()
  }
}

private extension View {
  @ViewBuilder
  func paywallScrollClipDisabled() -> some View {
    if #available(iOS 17.0, *) {
      self.scrollClipDisabled()
    } else {
      self
    }
  }
}

private struct PlanCard: View {
  let plan: StoreKitPaywallPlan
  let selected: Bool
  let width: CGFloat
  let height: CGFloat
  let onSelect: () -> Void

  var body: some View {
    Button(action: onSelect) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .top, spacing: 10) {
          VStack(alignment: .leading, spacing: 5) {
            Text(plan.title)
              .font(.title3.weight(.bold))
              .foregroundStyle(.white)
              .lineLimit(2)
              .minimumScaleFactor(0.78)

            Text(plan.price + plan.cadence)
              .font(.callout.weight(.bold))
              .foregroundStyle(.white.opacity(0.66))
          }

          Spacer(minLength: 8)

          if selected {
            Image(systemName: "checkmark.circle.fill")
              .font(.system(size: 28, weight: .bold))
              .symbolRenderingMode(.palette)
              .foregroundStyle(Color(red: 0.10, green: 0.10, blue: 0.11), .white)
          }
        }

        Spacer(minLength: 12)

        Divider()
          .background(.white.opacity(0.10))
          .padding(.horizontal, -18)

        Text(plan.detail)
          .font(.callout.weight(.semibold))
          .foregroundStyle(.white.opacity(0.86))
          .lineLimit(1)
          .minimumScaleFactor(0.78)
          .padding(.top, 12)
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 14)
      .frame(width: width, height: height)
      .background {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .fill(.ultraThinMaterial)
          .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
              .fill(Color(red: 0.08, green: 0.09, blue: 0.13).opacity(0.62))
          }
      }
      .overlay {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .strokeBorder(
            selected ? Color(red: 0.03, green: 0.54, blue: 1.0) : .white.opacity(0.12),
            lineWidth: selected ? 2 : 1
          )
      }
      .shadow(color: selected ? Color(red: 0.03, green: 0.54, blue: 1.0).opacity(0.20) : .clear, radius: 12, y: 4)
    }
    .buttonStyle(.plain)
  }
}

private enum StoreKitPaywallAssets {
  static func image(named name: String) -> UIImage? {
    if let bundle = resourceBundle,
       let image = UIImage(named: name, in: bundle, compatibleWith: nil) {
      return image
    }

    if let image = UIImage(named: name) {
      return image
    }

    return Bundle.allBundles
      .lazy
      .compactMap { bundle in
        UIImage(named: name, in: bundle, compatibleWith: nil)
          ?? bundle.path(forResource: name, ofType: "png").flatMap(UIImage.init(contentsOfFile:))
      }
      .first
  }

  private static let resourceBundle: Bundle? = {
    let moduleBundle = Bundle(for: GlassCardModule.self)
    let candidateURLs = [
      moduleBundle.url(forResource: "GlassCardPaywall", withExtension: "bundle"),
      moduleBundle.resourceURL?.appendingPathComponent("GlassCardPaywall.bundle"),
      Bundle.main.url(forResource: "GlassCardPaywall", withExtension: "bundle"),
      Bundle.main.resourceURL?.appendingPathComponent("GlassCardPaywall.bundle")
    ] + Bundle.allBundles.flatMap { bundle -> [URL] in
      [
        bundle.url(forResource: "GlassCardPaywall", withExtension: "bundle"),
        bundle.resourceURL?.appendingPathComponent("GlassCardPaywall.bundle")
      ].compactMap { $0 }
    }

    for url in candidateURLs.compactMap({ $0 }) {
      if let bundle = Bundle(url: url) {
        return bundle
      }
    }

    return moduleBundle
  }()
}
