import ExpoModulesCore
import ExpoUI
import StoreKit
import SwiftUI
import UIKit

public final class NativePayWallStoreKitDemoViewProps: UIBaseViewProps {
  var onPurchaseComplete = EventDispatcher()
}

public struct NativePayWallStoreKitDemoView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativePayWallStoreKitDemoViewProps

  public init(props: NativePayWallStoreKitDemoViewProps) {
    self.props = props
  }

  public var body: some View {
    if #available(iOS 18.0, *) {
      PayWallStoreKitDemoContentView(onPurchaseComplete: {
        props.onPurchaseComplete([:])
      })
    } else {
      ZStack {
        Color.black.ignoresSafeArea()
        Text("StoreKit paywall requires iOS 18 or newer.")
          .foregroundStyle(.white)
          .font(.callout)
          .multilineTextAlignment(.center)
          .padding()
      }
      .environment(\.colorScheme, .dark)
    }
  }
}

/// You can entirely build a custom product view and subscription button with the configuration properties as well!
@available(iOS 18.0, *)
private struct PayWallStoreKitDemoCustomSubscriptionStyle: SubscriptionStoreControlStyle {
    var isSmalliPhone: Bool
    var isLoadingComplete: () -> () = { }
    func makeBody(configuration: Configuration) -> some View {
        VStack(spacing: 25) {
            if isSmalliPhone {
                CompactPickerSubscriptionStoreControlStyle().makeBody(configuration: configuration)
            } else {
                PagedProminentPickerSubscriptionStoreControlStyle().makeBody(configuration: configuration)
            }
        }
        .offset(y: 12)
        .onAppear(perform: isLoadingComplete)
    }
}

/// IAP View Images
@available(iOS 18.0, *)
private enum PayWallStoreKitDemoIAPImage: String, CaseIterable {
    /// Raw value represents the asset image
    case one = "IAP1"
    case two = "IAP2"
    case three = "IAP3"
    case four = "IAP4"
}

@available(iOS 18.0, *)
private struct PayWallStoreKitDemoContentView: View {
    let onPurchaseComplete: () -> Void
    @State private var loadingStatus: (Bool, Bool) = (false, false)
    var body: some View {
        GeometryReader {
            let size = $0.size
            let isSmalleriPhone = size.height < 700
            
            VStack(spacing: 0) {
                Group {
                    if isSmalleriPhone {
                        SubscriptionStoreView(productIDs: Self.productIDs, marketingContent: {
                            CustomMarketingView()
                        })
                    } else {
                        SubscriptionStoreView(productIDs: Self.productIDs, marketingContent: {
                            CustomMarketingView()
                        })
                    }
                }
                .subscriptionStoreControlStyle(PayWallStoreKitDemoCustomSubscriptionStyle(isSmalliPhone: isSmalleriPhone) {
                    loadingStatus.0 = true
                }, placement: .scrollView)
                .subscriptionStorePickerItemBackground(.ultraThinMaterial)
                .storeButton(.visible, for: .restorePurchases)
                .storeButton(.hidden, for: .policies)
                .onInAppPurchaseStart { product in
                    print("Show Loading Screen")
                    print("Purchasing \(product.displayName)")
                }
                .onInAppPurchaseCompletion { product, result in
                    switch result {
                    case .success(let result):
                        switch result {
                        case .success(_):
                            print("Success and verify purchase using verification result")
                            onPurchaseComplete()
                        case .pending:
                            print("Pending Action")
                            onPurchaseComplete()
                        case .userCancelled: print("User Cancelled")
                        @unknown default:
                            fatalError()
                        }
                    case .failure(let error):
                        print(error.localizedDescription)
                    }
                    
                    print("Hide Loading Screen")
                }
                .subscriptionStatusTask(for: "4205BB53") {
                    if let result = $0.value {
                        let premiumUser = !result.filter({ $0.state == .subscribed }).isEmpty
                        print("User Subscribed = \(premiumUser)")
                    }
                    
                    loadingStatus.1 = true
                }
                
                /// Privacy Policy & Terms of Service
                HStack(spacing: 3) {
                    Link("Terms of Service", destination: URL(string: "https://apple.com")!)
                    
                    Text("And")
                    
                    Link("Privacy Policy", destination: URL(string: "https://apple.com")!)
                }
                .font(.caption)
                .padding(.bottom, 10)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .geometryGroup()
            .animation(.easeInOut(duration: 0.35), body: { content in
                content
                    .opacity(isLoadingCompleted ? 1 : 0)
            })
            .background(BackdropView())
            .overlay {
                ZStack {
                    if !isLoadingCompleted {
                        ProgressView()
                            .font(.largeTitle)
                    }
                }
                .animation(.easeInOut(duration: 0.35), value: isLoadingCompleted)
            }
            .task {
                await logProductAvailability()

                try? await Task.sleep(nanoseconds: 8_000_000_000)
                guard !isLoadingCompleted else { return }

                print("[PayWallStoreKitDemo] StoreKit loading timed out. Revealing paywall content. loadingStatus = \(loadingStatus)")
                loadingStatus = (true, true)
            }
        }
        .environment(\.colorScheme, .dark)
        .tint(.white)
        .statusBarHidden()
    }
    
    var isLoadingCompleted: Bool {
        loadingStatus.0 && loadingStatus.1
    }
    
    static var productIDs: [String] {
        return ["pro_weekly", "pro_monthly", "pro_yearly"]
    }

    func logProductAvailability() async {
        do {
            let products = try await Product.products(for: Self.productIDs)
            print("[PayWallStoreKitDemo] Product query returned \(products.count) products: \(products.map(\.id))")
        } catch {
            print("[PayWallStoreKitDemo] Product query failed: \(error.localizedDescription)")
        }
    }
    
    /// Backdrop View
    @ViewBuilder
    func BackdropView() -> some View {
        GeometryReader {
            let size = $0.size
            
            /// This is a Dark image, but you can use your own image as per your needs!
            PayWallStoreKitDemoAssets.image(named: "IAP4")
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: size.width, height: size.height)
                .scaleEffect(1.5)
                .blur(radius: 70, opaque: true)
                .overlay {
                    Rectangle()
                        .fill(.black.opacity(0.2))
                }
        }
        .ignoresSafeArea()
    }
    
    /// Custom Marketing View (Header View)
    @ViewBuilder
    func CustomMarketingView() -> some View {
        VStack(spacing: 15) {
            /// App Screenshots View
            HStack(spacing: 25) {
                ScreenshotsView([.one, .two, .three], offset: -200)
                ScreenshotsView([.four, .one, .two], offset: -350)
                ScreenshotsView([.two, .three, .one], offset: -250)
                    .overlay(alignment: .trailing) {
                        ScreenshotsView([.four, .two, .one], offset: -150)
                            .visualEffect { content, proxy in
                                content
                                    .offset(x: proxy.size.width + 25)
                            }
                    }
            }
            .frame(maxHeight: .infinity)
            .offset(x: 20)
            /// Progress Blur Mask
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
            
            /// Replace with your App Information
            VStack(spacing: 6) {
                Text("App Name")
                    .font(.title3)
                
                Text("Membership")
                    .font(.largeTitle.bold())
                
                Text("Lorem Ipsum is simply dummy text\nof the printing and typesetting industry.")
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
    func ScreenshotsView(_ content: [PayWallStoreKitDemoIAPImage], offset: CGFloat) -> some View {
        ScrollView(.vertical) {
            VStack(spacing: 10) {
                ForEach(content.indices, id: \.self) { index in
                    PayWallStoreKitDemoAssets.image(named: content[index].rawValue)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                }
            }
            .offset(y: offset)
        }
        .scrollDisabled(true)
        .scrollIndicators(.hidden)
        .rotationEffect(.init(degrees: -30), anchor: .bottom)
        .scrollClipDisabled()
    }
}

private enum PayWallStoreKitDemoAssets {
  static func image(named name: String) -> Image {
    if let image = uiImage(named: name) {
      return Image(uiImage: image)
    }
    return Image(name)
  }

  private static func uiImage(named name: String) -> UIImage? {
    candidateBundles()
      .lazy
      .compactMap { UIImage(named: name, in: $0, compatibleWith: nil) }
      .first
  }

  private static func candidateBundles() -> [Bundle] {
    var bundles: [Bundle] = []
    let moduleBundle = Bundle(for: NativePayWallStoreKitDemoViewProps.self)
    bundles.append(moduleBundle)
    bundles.append(Bundle.main)

    let resourceURLs = [
      moduleBundle.url(forResource: "GlassCardPaywall", withExtension: "bundle"),
      moduleBundle.resourceURL?.appendingPathComponent("GlassCardPaywall.bundle"),
      Bundle.main.url(forResource: "GlassCardPaywall", withExtension: "bundle"),
      Bundle.main.resourceURL?.appendingPathComponent("GlassCardPaywall.bundle")
    ]

    for url in resourceURLs {
      if let url, let bundle = Bundle(url: url) {
        bundles.append(bundle)
      }
    }

    for bundle in Bundle.allBundles {
      bundles.append(bundle)
      if let nestedURL = bundle.url(forResource: "GlassCardPaywall", withExtension: "bundle"),
         let nestedBundle = Bundle(url: nestedURL) {
        bundles.append(nestedBundle)
      }
    }

    return bundles
  }
}
