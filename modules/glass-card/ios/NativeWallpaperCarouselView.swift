import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeWallpaperCarouselViewProps: UIBaseViewProps {
  @Field var wallpapersJson: String = "[]"
  @Field var selectedId: String = ""
  @Field var resetKey: String = ""
  @Field var isDark: Bool = true
  @Field var bottomInset: Double = 0
  @Field var backgroundColor: String = "#080A0D"
  var onSelect = EventDispatcher()
  var onApply = EventDispatcher()
  var onAdd = EventDispatcher()
}

public struct NativeWallpaperCarouselView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeWallpaperCarouselViewProps

  public init(props: NativeWallpaperCarouselViewProps) {
    self.props = props
  }

  public var body: some View {
    if #available(iOS 26.0, *) {
      CustomCarousel(
        wallpapers: decodedWallpapers,
        selectedId: props.selectedId,
        resetKey: props.resetKey,
        isDark: props.isDark,
        bottomInset: CGFloat(props.bottomInset),
        backgroundColor: props.backgroundColor,
        onSelect: { wallpaper in props.onSelect(["id": wallpaper.id]) },
        onApply: { props.onApply([:]) },
        onAdd: { props.onAdd([:]) }
      )
      .preferredColorScheme(props.isDark ? .dark : .light)
    } else {
      ZStack {
        Color.black.ignoresSafeArea()
        Text("Wallpaper carousel requires iOS 26.")
          .font(.caption)
          .foregroundStyle(.white.opacity(0.7))
      }
    }
  }

  private var decodedWallpapers: [Wallpaper] {
    guard let data = props.wallpapersJson.data(using: .utf8) else {
      return []
    }

    return (try? JSONDecoder().decode([Wallpaper].self, from: data)) ?? []
  }
}

/// Sample Model
struct Wallpaper: Identifiable, Decodable, Equatable {
    var id: String = UUID().uuidString
    var title: String
    var image: String
    var isUploadPlaceholder: Bool?
}

@available(iOS 26.0, *)
private final class WallpaperImageStore: ObservableObject {
    static let shared = WallpaperImageStore()

    @Published var version: Int = 0

    private let cache = NSCache<NSString, UIImage>()
    private var inFlight = Set<String>()
    private let lock = NSLock()

    func preload(_ wallpapers: [Wallpaper]) {
        wallpapers
            .filter { $0.isUploadPlaceholder != true }
            .forEach { loadImageIfNeeded($0.image) }
    }

    func image(for source: String) -> UIImage? {
        let key = source as NSString
        if let cached = cache.object(forKey: key) {
            return cached
        }

        guard let image = synchronousImage(for: source) else {
            return nil
        }

        cache.setObject(image, forKey: key)
        return image
    }

    private func loadImageIfNeeded(_ source: String) {
        guard image(for: source) == nil, let url = URL(string: source), !url.isFileURL else {
            return
        }

        lock.lock()
        if inFlight.contains(source) {
            lock.unlock()
            return
        }
        inFlight.insert(source)
        lock.unlock()

        let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 60)
        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let self else { return }
            let image = data.flatMap(UIImage.init(data:))

            DispatchQueue.main.async {
                self.lock.lock()
                self.inFlight.remove(source)
                self.lock.unlock()

                if let image {
                    self.cache.setObject(image, forKey: source as NSString)
                    self.version &+= 1
                }
            }
        }.resume()
    }

    private func synchronousImage(for source: String) -> UIImage? {
        if source.hasPrefix("data:image/"),
           let commaIndex = source.firstIndex(of: ",") {
            let base64 = String(source[source.index(after: commaIndex)...])
            return Data(base64Encoded: base64).flatMap(UIImage.init(data:))
        }

        guard let url = URL(string: source) else {
            return UIImage(named: source)
        }

        if url.isFileURL {
            return UIImage(contentsOfFile: url.path)
        }

        let request = URLRequest(url: url)
        if let cachedResponse = URLCache.shared.cachedResponse(for: request) {
            return UIImage(data: cachedResponse.data)
        }

        return nil
    }
}

@available(iOS 26.0, *)
struct CustomCarousel: View {
    var wallpapers: [Wallpaper]
    var selectedId: String
    var resetKey: String
    var isDark: Bool
    var bottomInset: CGFloat
    var backgroundColor: String
    var onSelect: (Wallpaper) -> ()
    var onApply: () -> ()
    var onAdd: () -> ()
    /// View Properties
    @State private var offsetX: CGFloat = 0
    @State private var selectedWallpaper: String?
    @State private var reflectionScrollPosition: ScrollPosition = .init()
    @ObservedObject private var imageStore = WallpaperImageStore.shared
    var body: some View {
        GeometryReader {
            let size = $0.size
            /// You can customize it as per your needs!
            let bottomSpacing = max(bottomInset + 24, 48)
            let maxCardHeight = min(max((size.height - 85 - bottomSpacing), 0), 700)
            let cardWidth = min(273, max(190, min(size.width * 0.72, maxCardHeight * (9 / 19.5))))
            let cardHeight = cardWidth * (19.5 / 9)
            let horizontalPadding = (size.width - cardWidth) / 2
            
            ZStack {
                Rectangle()
                    .fill(carouselBackgroundColor)
                    .ignoresSafeArea()
                
                if size != .zero {
                    VStack(spacing: 15) {
                        /// Custom Snap Carousel Using ScrollView
                        ScrollView(.horizontal) {
                            ReusableWallpaperStackView(cardWidth: cardWidth, cardHeight: cardHeight)
                                .scrollTargetLayout()
                        }
                        .scrollIndicators(.hidden)
                        .scrollTargetBehavior(.viewAligned(limitBehavior: .always))
                        .scrollPosition(id: $selectedWallpaper, anchor: .center)
                        /// Making it to start and end at the center
                        .safeAreaPadding(.horizontal, horizontalPadding)
                        .frame(height: cardHeight)
                        .onScrollGeometryChange(for: CGFloat.self) {
                            $0.contentOffset.x + $0.contentInsets.leading
                        } action: { oldValue, newValue in
                            offsetX = newValue
                            reflectionScrollPosition.scrollTo(x: newValue)
                        }
                        
                        BottomBar(size: size, cardWidth: cardWidth, cardHeight: cardHeight)
                            .padding(.bottom, bottomSpacing)
                    }
                }
            }
        }
        .onAppear {
            imageStore.preload(wallpapers)
            guard selectedWallpaper == nil else { return }
            selectedWallpaper = wallpapers.contains(where: { $0.id == selectedId }) ? selectedId : wallpapers.first?.id
        }
        .onChange(of: resetKey) { _ in
            imageStore.preload(wallpapers)
            selectedWallpaper = wallpapers.first?.id
        }
        .onChange(of: wallpapers.map(\.id).joined(separator: "|")) { _ in
            imageStore.preload(wallpapers)
            selectedWallpaper = wallpapers.contains(where: { $0.id == selectedId }) ? selectedId : wallpapers.first?.id
        }
        .onChange(of: selectedId) { newValue in
            if wallpapers.contains(where: { $0.id == newValue }) {
                selectedWallpaper = newValue
            }
        }
        .onChange(of: selectedWallpaper) { newValue in
            if let newValue, let wallpaper = wallpapers.first(where: { $0.id == newValue }) {
                onSelect(wallpaper)
            }
        }
    }
    
    /// Reusable Wallpaper StackView
    @ViewBuilder
    func ReusableWallpaperStackView(cardWidth: CGFloat, cardHeight: CGFloat) -> some View {
        LazyHStack(spacing: 15) {
            ForEach(wallpapers) { wallpaper in
                WallpaperImage(wallpaper: wallpaper, isDark: isDark, imageStore: imageStore)
                    .frame(width: cardWidth, height: cardHeight)
                    .clipShape(.rect(cornerRadius: 40))
                    .contentShape(.rect)
                    .onTapGesture {
                        if wallpaper.isUploadPlaceholder == true {
                            onAdd()
                        }
                    }
            }
        }
    }
    
    /// Sliding Label View!
    @ViewBuilder
    func LabelView(size: CGSize, cardWidth: CGFloat) -> some View {
        /// 15: Spacing in HStack
        let progress = offsetX / (cardWidth + 15)
        let slideOffset = progress * size.width
        
        HStack(spacing: 0) {
            ForEach(wallpapers) { wallpaper in
                Text(wallpaper.title)
                    .font(.title2)
                    .fontWeight(.medium)
                    .frame(width: size.width)
            }
        }
        .offset(x: -slideOffset)
        .frame(width: size.width, height: 50, alignment: .leading)
        .foregroundStyle(.white)
    }
    
    /// Bottom Bar with Light Reflection Effect
    @ViewBuilder
    func BottomBar(size: CGSize, cardWidth: CGFloat, cardHeight: CGFloat) -> some View {
        ZStack {
            let horizontalPadding = (size.width - cardWidth) / 2
            
            let bottombarLayout = HStack(spacing: 10) {
                Capsule()
                    .fill(carouselBackgroundColor)
                    .frame(width: 220, height: 55)
                
                Circle()
                    .fill(carouselBackgroundColor)
                    .frame(width: 55, height: 55)
            }
            
            ScrollView(.horizontal) {
                ReusableWallpaperStackView(cardWidth: cardWidth, cardHeight: cardHeight)
            }
            .safeAreaPadding(.horizontal, horizontalPadding)
            .scrollPosition($reflectionScrollPosition)
            .scrollIndicators(.hidden)
            .frame(width: size.width, height: size.height, alignment: .leading)
            /// Smoothing out with blur
            .compositingGroup()
            .blur(radius: 10)
            .frame(height: 60, alignment: .bottom)
            .offset(y: 130)
            .mask {
                bottombarLayout
                    /// Optional Gradient Mask!
                    .mask {
                        LinearGradient(colors: [
                            .white,
                            .white.opacity(0.5),
                            .clear,
                            .clear
                        ], startPoint: .top, endPoint: .bottom)
                    }
                    /// Customize it as per your needs!
                    .offset(x: 33, y: -0.6)
            }
            .overlay {
                bottombarLayout
                    .offset(x: 33)
            }
            .allowsHitTesting(false)
            
            HStack(spacing: 10) {
                Button {
                    onApply()
                } label: {
                    Text("Apply")
                        .fontWeight(.medium)
                        .frame(width: 220, height: 55)
                        .buttonBackground(isDark: isDark)
                }
                
                Button {
                    onAdd()
                } label: {
                    Image(systemName: "xmark")
                        .font(.title2)
                        .fontWeight(.semibold)
                        .frame(width: 55, height: 55)
                        .buttonBackground(isDark: isDark)
                }
            }
            .foregroundStyle(isDark ? .white : .black.opacity(0.82))
            /// Making the Customize button to become the center
            /// 55 + 10 = 65 / 2 => 32.5!
            .offset(x: 33)
        }
        .frame(height: 60)
        .padding(.top, 10)
    }
    
    var carouselBackgroundColor: Color {
        return Color(hexString: backgroundColor) ?? (isDark ? .black : .white)
    }
}

@available(iOS 26.0, *)
private struct WallpaperImage: View {
    let wallpaper: Wallpaper
    let isDark: Bool
    @ObservedObject var imageStore: WallpaperImageStore
    
    var body: some View {
        let _ = imageStore.version

        if wallpaper.isUploadPlaceholder == true {
            WallpaperPlaceholder(isDark: isDark, showsPlus: true)
        } else if let uiImage = imageStore.image(for: wallpaper.image) {
            Image(uiImage: uiImage)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            WallpaperPlaceholder(isDark: isDark, showsPlus: false)
                .onAppear {
                    imageStore.preload([wallpaper])
                }
        }
    }
}

@available(iOS 26.0, *)
private struct WallpaperPlaceholder: View {
    let isDark: Bool
    let showsPlus: Bool

    var body: some View {
        ZStack {
            Rectangle()
                .fill(placeholderFill)

            if showsPlus {
                Circle()
                    .fill(symbolBackground)
                    .frame(width: 64, height: 64)

                Image(systemName: "plus")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(symbolColor)
            }
        }
    }

    private var placeholderFill: Color {
        Color(hexString: isDark ? "#2A2E35" : "#D9DDE2") ?? Color.gray.opacity(isDark ? 0.35 : 0.24)
    }

    private var symbolBackground: Color {
        (isDark ? Color.white : Color.black).opacity(isDark ? 0.08 : 0.06)
    }

    private var symbolColor: Color {
        (isDark ? Color.white : Color.black).opacity(isDark ? 0.72 : 0.56)
    }
}

/// Custom Background View
fileprivate extension View {
    @ViewBuilder
    func buttonBackground(isDark: Bool) -> some View {
        self
            .background {
                ZStack {
                    Capsule()
                        .fill((isDark ? Color.white : Color.black).opacity(isDark ? 0.05 : 0.04))
                    
                    Capsule()
                        .stroke((isDark ? Color.white : Color.black).opacity(isDark ? 0.1 : 0.09), lineWidth: 1)
                }
            }
    }
}

fileprivate extension Color {
    init?(hexString: String) {
        var raw = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("#") {
            raw.removeFirst()
        }

        guard raw.count == 6 || raw.count == 8,
              let value = UInt64(raw, radix: 16) else {
            return nil
        }

        let red: Double
        let green: Double
        let blue: Double
        let alpha: Double

        if raw.count == 8 {
            red = Double((value >> 24) & 0xFF) / 255
            green = Double((value >> 16) & 0xFF) / 255
            blue = Double((value >> 8) & 0xFF) / 255
            alpha = Double(value & 0xFF) / 255
        } else {
            red = Double((value >> 16) & 0xFF) / 255
            green = Double((value >> 8) & 0xFF) / 255
            blue = Double(value & 0xFF) / 255
            alpha = 1
        }

        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}
