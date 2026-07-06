//
//  OneTimeOnBoarding.swift
//  User-Tutorial-Screen
//
//  Created by Balaji Venkatesh on 10/08/25.
//

import SwiftUI

/// OnBoarding Item
fileprivate struct OnBoardingItem: Identifiable {
    var id: Int
    var view: AnyView
    var maskLocation: CGRect
    var cornerRadius: CGFloat
}

/// ONBoarding Coordinator
@Observable
fileprivate class OnBoardingCoordinator {
    var items: [OnBoardingItem] = []
    var overlayWindow: UIWindow?
    var isOnBoardingFinished: Bool = false
    
    /// Ordered-Items
    var orderedItems: [OnBoardingItem] {
        items.sorted { $0.id < $1.id }
    }
}

struct OneTimeOnBoarding<Content: View>: View {
    @AppStorage var isOnBoarded: Bool
    var content: Content
    /// Allows you to do job before animating the onboarding effect!
    var beginOnboarding: () async -> Void
    var onBoardingFinished: () -> Void
    
    init(
        appStorageID: String,
        @ViewBuilder content: @escaping () -> Content,
        beginOnboarding: @escaping () async -> Void,
        onBoardingFinished: @escaping () -> Void
    ) {
        /// Initializing User-Defaults!
        self._isOnBoarded = .init(wrappedValue: false, appStorageID)
        self.content = content()
        self.beginOnboarding = beginOnboarding
        self.onBoardingFinished = onBoardingFinished
    }
    
    fileprivate var coordinator = OnBoardingCoordinator()
    var body: some View {
        content
            .environment(coordinator)
            .task {
                if !isOnBoarded {
                    await beginOnboarding()
                }
                await createWindow()
            }
            .onChange(of: coordinator.isOnBoardingFinished) { oldValue, newValue in
                if newValue {
                    isOnBoarded = true
                    onBoardingFinished()
                    hideWindow()
                }
            }
    }
    
    private func createWindow() async {
        if let scene = (UIApplication.shared.connectedScenes.first as? UIWindowScene),
           !isOnBoarded, coordinator.overlayWindow == nil {
            if let window = scene.windows.first(where: { $0.tag == 1009 }) {
                /// Removing Previews Data
                window.rootViewController = nil
                window.isHidden = false
                window.isUserInteractionEnabled = true
                coordinator.overlayWindow = window
            } else {
                let window = UIWindow(windowScene: scene)
                window.backgroundColor = .clear
                window.isHidden = false
                window.isUserInteractionEnabled = true
                window.tag = 1009
                
                coordinator.overlayWindow = window
            }
            
            /// A Little delay to load the items into the coordinator object using the onGeometryChange modifier!
            try? await Task.sleep(for: .seconds(0.1))
            if coordinator.items.isEmpty {
                hideWindow()
            } else {
                /// Snapshot window and animate it!
                guard let snapshot = snapshotScreen() else {
                    hideWindow()
                    return
                }
                
                let hostController = UIHostingController(rootView: OverlayWindowView(snapshot: snapshot).environment(coordinator))
                hostController.view.backgroundColor = .clear
                coordinator.overlayWindow?.rootViewController = hostController
            }
        }
    }
    
    private func hideWindow() {
        coordinator.overlayWindow?.rootViewController = nil
        coordinator.overlayWindow?.isHidden = true
        coordinator.overlayWindow?.isUserInteractionEnabled = false
    }
}

extension View {
    /// You can pass custom shape for each onboarding item as well!
    @ViewBuilder
    func onBoarding<Content: View>(_ position: Int, cornerRadius: CGFloat = 35, @ViewBuilder content: @escaping () -> Content) -> some View {
        self
            .modifier(OnBoardingItemSetter(position: position, cornerRadius: cornerRadius, onBoardingContent: content))
    }
}

/// OnBoarding Item-Setter
fileprivate
struct OnBoardingItemSetter<OnBoardingContent: View>: ViewModifier {
    var position: Int
    var cornerRadius: CGFloat
    @ViewBuilder var onBoardingContent: OnBoardingContent
    
    @Environment(OnBoardingCoordinator.self) var coordinator
    func body(content: Content) -> some View {
        content
            /// Adding/Removing item to the coordinator object!
            .onGeometryChange(for: CGRect.self) {
                $0.frame(in: .global)
            } action: { newValue in
                coordinator.items.removeAll(where: { $0.id == position })
                
                let newItem = OnBoardingItem(
                    id: position,
                    view: .init(onBoardingContent),
                    maskLocation: newValue,
                    cornerRadius: cornerRadius
                )
                coordinator.items.append(newItem)
            }
            .onDisappear {
                coordinator.items.removeAll(where: { $0.id == position })
            }
    }
}

/// Overlay Window View (Animation View)
fileprivate struct OverlayWindowView: View {
    var snapshot: UIImage
    @Environment(OnBoardingCoordinator.self) var coordinator
    /// View Properties
    @State private var animate: Bool = false
    @State private var currentIndex: Int = 0
    var body: some View {
        GeometryReader {
            let safeArea = $0.safeAreaInsets
            let isHomeButtoniPhone = safeArea.bottom == 0
            let cornerRadius: CGFloat = isHomeButtoniPhone ? 15 : 35
            
            ZStack {
                Rectangle()
                    .fill(.black)
                
                Image(uiImage: snapshot)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .overlay {
                        Rectangle()
                            .fill(.black.opacity(0.5))
                            /// Reverse masking the current Mask Location!
                            .reverseMask(alignment: .topLeading) {
                                if !orderedItems.isEmpty {
                                    let maskLocation = orderedItems[currentIndex].maskLocation
                                    let cornerRadius = orderedItems[currentIndex].cornerRadius
                                 
                                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                        .frame(width: maskLocation.width, height: maskLocation.height)
                                        .offset(
                                            x: maskLocation.minX,
                                            y: maskLocation.minY
                                        )
                                }
                            }
                            .opacity(animate ? 1 : 0)
                    }
                    .clipShape(.rect(cornerRadius: animate ? cornerRadius : 0, style: .circular))
                    .overlay {
                        iPhoneShape(safeArea)
                    }
                    .scaleEffect(animate ? 0.65 : 1, anchor: .top)
                    .offset(y: animate ? safeArea.top + 25 : 0)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(alignment: .bottom) {
                        BottomView(safeArea)
                    }
            }
            .ignoresSafeArea()
        }
        .onAppear {
            guard !animate else { return }
            withAnimation(.smooth(duration: 0.35, extraBounce: 0)) {
                animate = true
            }
        }
    }
    
    @ViewBuilder
    private func iPhoneShape(_ safeArea: EdgeInsets) -> some View {
        let isHomeButtoniPhone = safeArea.bottom == 0
        let cornerRadius: CGFloat = isHomeButtoniPhone ? 20 : 45
        
        ZStack(alignment: .top) {
            RoundedRectangle(cornerRadius: animate ? cornerRadius : 0, style: .continuous)
                .stroke(.white, lineWidth: animate ? 15 : 0)
                .padding(-6)
            
            /// Dynamic Island for all iPhone except Home-Button
            /// You can modify this to add notch if you wish so!
            if safeArea.bottom != 0 {
                Capsule()
                    .fill(.black)
                    .frame(width: 120, height: 40)
                    .offset(y: 20)
                    .opacity(animate ? 1 : 0)
            }
        }
    }
    
    @ViewBuilder
    private func BottomView(_ safeArea: EdgeInsets) -> some View {
        VStack(spacing: 10) {
            /// Switching between the onboarding items view!
            ZStack {
                ForEach(orderedItems) { info in
                    if currentIndex == orderedItems.firstIndex(where: { $0.id == info.id }) {
                        info.view
                            .transition(.blurReplace)
                            .environment(\.colorScheme, .dark)
                    }
                }
            }
            .frame(height: 70)
            .frame(maxWidth: 280)
            
            /// Continue, Back, Skip Button!
            HStack(spacing: 6) {
                if currentIndex > 0 {
                    Button {
                        withAnimation(.smooth(duration: 0.35, extraBounce: 0)) {
                            currentIndex = max((currentIndex - 1), 0)
                        }
                    } label: {
                        Image(systemName: "chevron.left.circle.fill")
                            .font(.system(size: 38))
                            .foregroundStyle(.white, .gray.opacity(0.4))
                    }
                }
                
                Button {
                    if currentIndex == orderedItems.count - 1 {
                        /// Finish Animation and remove window
                        closeWindow()
                    } else {
                        /// Next Index
                        withAnimation(.smooth(duration: 0.35, extraBounce: 0)) {
                            currentIndex += 1
                        }
                    }
                } label: {
                    Text(currentIndex == orderedItems.count - 1 ? "Finish" : "Next")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .contentTransition(.numericText())
                        .foregroundStyle(.white)
                        .padding(.vertical, 10)
                        .background(.blue.gradient, in: .capsule)
                }
            }
            .frame(maxWidth: 250)
            .frame(height: 50)
            .padding(.leading, currentIndex > 0 ? -45 : 0)
            
            Button(action: closeWindow) {
                Text("Skip Tutorial")
                    .font(.callout)
                    .underline()
            }
            .foregroundStyle(.gray)
        }
        .padding(.horizontal, 15)
        .padding(.bottom, safeArea.bottom + 10)
    }
    
    private func closeWindow() {
        withAnimation(.easeInOut(duration: 0.25), completionCriteria: .removed) {
            animate = false
        } completion: {
            coordinator.isOnBoardingFinished = true
        }
    }
    
    var orderedItems: [OnBoardingItem] {
        coordinator.orderedItems
    }
}

extension View {
    /// Snapshoting the screen
    fileprivate func snapshotScreen() -> UIImage? {
        if let snaposhotView = (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.keyWindow {
            let renderer: UIGraphicsImageRenderer = UIGraphicsImageRenderer(size: snaposhotView.bounds.size)
            let image: UIImage = renderer.image { context in
                snaposhotView.drawHierarchy(in: snaposhotView.bounds, afterScreenUpdates: true)
            }
            
            return image
        }
        
        return nil
    }
    
    /// Reverse Mask
    @ViewBuilder
    fileprivate func reverseMask<Content: View>(alignment: Alignment = .center, @ViewBuilder content: @escaping () -> Content) -> some View {
        self
            .mask {
                Rectangle()
                    .overlay(alignment: alignment) {
                        content()
                            .blendMode(.destinationOut)
                    }
            }
    }
}

#Preview {
    ContentView()
}
