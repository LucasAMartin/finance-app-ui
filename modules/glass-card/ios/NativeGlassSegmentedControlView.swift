import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class NativeGlassSegmentedControlViewProps: UIBaseViewProps {
    @Field var tabsJson: String = "[]"
    @Field var selectedId: String = ""
    @Field var isDark: Bool = true
    var onSelect = EventDispatcher()
}

public struct NativeGlassSegmentedControlView: ExpoSwiftUI.View {
    @ObservedObject public var props: NativeGlassSegmentedControlViewProps

    public init(props: NativeGlassSegmentedControlViewProps) {
        self.props = props
    }

    public var body: some View {
        if #available(iOS 18.4, *) {
            NativeGlassSegmentedControlBridge(
                sourceTabs: decodedTabs,
                selectedId: props.selectedId,
                onSelect: { tab in props.onSelect(["id": tab.id]) }
            )
            .preferredColorScheme(props.isDark ? .dark : .light)
        } else {
            EmptyView()
        }
    }

    private var decodedTabs: [NativeGlassSegmentedTab] {
        guard let data = props.tabsJson.data(using: .utf8) else {
            return []
        }

        return (try? JSONDecoder().decode([NativeGlassSegmentedTab].self, from: data)) ?? []
    }
}

private struct NativeGlassSegmentedTab: Codable, Identifiable, Equatable {
    let id: String
    let title: String
}

@available(iOS 18.4, *)
private struct NativeGlassSegmentedControlBridge: View {
    var sourceTabs: [NativeGlassSegmentedTab]
    var selectedId: String
    var onSelect: (NativeGlassSegmentedTab) -> ()

    @State private var selection: Int
    @State private var tabs: [GlassSegmentedControl.Tab]

    init(
        sourceTabs: [NativeGlassSegmentedTab],
        selectedId: String,
        onSelect: @escaping (NativeGlassSegmentedTab) -> ()
    ) {
        self.sourceTabs = sourceTabs
        self.selectedId = selectedId
        self.onSelect = onSelect

        let initialSelection = sourceTabs.firstIndex(where: { $0.id == selectedId }) ?? 0
        _selection = State(initialValue: initialSelection)
        _tabs = State(initialValue: sourceTabs.map { GlassSegmentedControl.Tab(title: $0.title) })
    }

    var body: some View {
        if !tabs.isEmpty {
            GlassSegmentedControl(
                config: .init(refractionAmount: 10, selectionChangeAnimation: .easeInOut(duration: 0.25)),
                selection: $selection,
                tabs: $tabs
            )
            .onChange(of: sourceTabsKey) { _, _ in
                syncTabs()
                syncSelection()
            }
            .onChange(of: selectedId) { _, _ in
                syncSelection()
            }
            .onChange(of: selection) { _, newValue in
                guard sourceTabs.indices.contains(newValue) else {
                    return
                }
                onSelect(sourceTabs[newValue])
            }
        } else {
            Color.clear.frame(height: 50)
        }
    }

    private var sourceTabsKey: String {
        sourceTabs.map { "\($0.id):\($0.title)" }.joined(separator: "|")
    }

    private func syncTabs() {
        let nextTabs = sourceTabs.map { GlassSegmentedControl.Tab(title: $0.title) }
        guard nextTabs.map(\.title) != tabs.map(\.title) else {
            return
        }
        tabs = nextTabs
    }

    private func syncSelection() {
        guard !sourceTabs.isEmpty else {
            selection = 0
            return
        }
        let index = sourceTabs.firstIndex(where: { $0.id == selectedId }) ?? 0
        if selection != index {
            selection = index
        }
    }
}

//
//  GlassSegmentedControl.swift
//  GSControl
//
//  Created by Balaji Venkatesh on 21/05/26.
//

@available(iOS 18.4, *)
struct GlassSegmentedControl: View {
    var config: Config = .init()
    @Binding var selection: Int
    @Binding var tabs: [Self.Tab]
    /// View Properties
    @State private var activeIndex: Int?
    @State private var scrollPosition: ScrollPosition = .init()
    @State private var scrollPhase: ScrollPhase = .idle
    var body: some View {
        GeometryReader {
            let containerSize = $0.size
            let activeSize = tabs[activeIndex ?? 0].viewSize
            
            /// ScrollView
            ScrollView(.horizontal) {
                HStack(spacing: 0) {
                    ForEach($tabs) { $tab in
                        Text(tab.title)
                            .font(.system(size: 18))
                            .padding(.horizontal, (config.refractionDepth + 3))
                            .frame(height: containerSize.height)
                            /// Retreiving View Size
                            .onGeometryChange(for: CGSize.self) {
                                $0.size
                            } action: { newValue in
                                tab.viewSize = newValue
                            }
                            .contentShape(.rect)
                            .onTapGesture {
                                if let index = tabs.firstIndex(where: { $0.id == tab.id }) {
                                    selection = index
                                }
                            }
                    }
                }
                /// Optional Current Item Highlight With Tint Color
                .overlay {
                    HStack(spacing: 0) {
                        ForEach($tabs) { $tab in
                            Text(tab.title)
                                .font(.system(size: 18))
                                .foregroundStyle(config.tint)
                                .padding(.horizontal, (config.refractionDepth + 3))
                                .frame(height: containerSize.height)
                        }
                    }
                    .mask(alignment: .leading) {
                        Capsule()
                            .frame(width: activeSize.width, height: activeSize.height)
                            .visualEffect { content, proxy in
                                let midX = proxy.frame(in: .scrollView).midX
                                
                                return content
                                    .offset(x: -midX)
                            }
                    }
                    .allowsHitTesting(false)
                }
                /// Liquid Lens Metal Effect
                .visualEffect { [config] content, proxy in
                    let rect = proxy.frame(in: .scrollView)
                    let minX = rect.minX + (activeSize.width / 2)
                    
                    return content
                        .layerEffect(
                            GlassSegmentedControlShaders.liquidLens(
                                .float2(activeSize),
                                /// Keeps Pill At the same center position!
                                .float(-minX),
                                .float(config.refractionAmount),
                                .float(config.refractionDepth)
                            ),
                            maxSampleOffset: .init(width: 200, height: 100)
                        )
                }
                /// Capsule Shape
                .background(alignment: .leading) {
                    /// This project supports iOS 18+
                    ZStack {
                        if #available(iOS 26, *) {
                            Capsule()
                                .fill(.clear)
                                .frame(width: activeSize.width, height: activeSize.height)
                                .glassEffect(.regular, in: .capsule)
                        } else {
                            Capsule()
                                .fill(.ultraThinMaterial)
                                .frame(width: activeSize.width, height: activeSize.height)
                        }
                    }
                    .allowsHitTesting(false)
                    .visualEffect { content, proxy in
                        let midX = proxy.frame(in: .scrollView).midX
                        
                        return content
                            .offset(x: -midX)
                    }
                }
                .animation(
                    .interactiveSpring(response: 0.35, dampingFraction: 0.3, blendDuration: 0.4),
                    value: activeIndex
                )
            }
            .scrollIndicators(.hidden)
            /// Starting and ending at center
            .safeAreaPadding(.horizontal, (containerSize.width / 2))
            .scrollTargetBehavior(CustomScrollTarget(tabs: $tabs))
            .scrollPosition($scrollPosition, anchor: .center)
            .onScrollGeometryChange(for: CGFloat.self) {
                $0.contentOffset.x + $0.contentInsets.leading
            } action: { oldValue, newValue in
                if let index = tabs.closetSnapPointIndex(newValue), activeIndex != nil {
                    activeIndex = index
                    if scrollPhase != .animating {
                        selection = index
                    }
                }
            }
            .onScrollPhaseChange { oldPhase, newPhase in
                scrollPhase = newPhase
            }
        }
        .frame(height: 50)
        .task {
            if activeIndex == nil {
                let cappedIndex = max(min(selection, tabs.count - 1), 0)
                selection = cappedIndex
                activeIndex = cappedIndex
                
                scrollPosition.scrollTo(x: tabs.snapPoints[cappedIndex])
            }
        }
        .onChange(of: selection) { oldValue, newValue in
            if activeIndex != newValue {
                let cappedIndex = max(min(selection, tabs.count - 1), 0)
                withAnimation(config.selectionChangeAnimation) {
                    scrollPosition.scrollTo(x: tabs.snapPoints[cappedIndex])
                }
            }
        }
        .allowsHitTesting(scrollPhase != .animating)
        .sensoryFeedback(.selection, trigger: selection)
    }
    
    /// Config
    struct Config {
        var tint: Color = .yellow
        var refractionAmount: CGFloat = 10
        var refractionDepth: CGFloat = 17
        /// NOTE: Don't Use Bouncy Animation Here!
        var selectionChangeAnimation: Animation? = .none
    }
    
    /// Tab
    struct Tab: Identifiable {
        var title: String
        fileprivate var viewSize: CGSize = .zero
        
        init(title: String) {
            self.title = title
        }
        
        var id: String { title }
    }
}

@available(iOS 18.4, *)
private enum GlassSegmentedControlShaders {
    static var liquidLens: ShaderFunction {
        ShaderLibrary.bundle(shaderBundle).liquidLens
    }

    private static var shaderBundle: Bundle {
        guard let bundleURL = Bundle.main.url(forResource: "GlassCardShaders", withExtension: "bundle"),
              let bundle = Bundle(url: bundleURL) else {
            return .main
        }

        return bundle
    }
}

@available(iOS 18.4, *)
fileprivate extension [GlassSegmentedControl.Tab] {
    var snapPoints: [CGFloat] {
        var snapPoints: [CGFloat] = []
        var x: CGFloat = 0
        for tab in self {
            snapPoints.append(x + tab.viewSize.width / 2)
            x += tab.viewSize.width
        }
        
        return snapPoints
    }
    
    func closetSnapPoint(_ offset: CGFloat) -> CGFloat {
        snapPoints.min(by: {
            abs($0 - offset) < abs($1 - offset)
        }) ?? offset
    }
    
    func closetSnapPointIndex(_ offset: CGFloat) -> Int? {
        if let (index, _) = snapPoints.enumerated().min(by: {
            abs($0.element - offset) < abs($1.element - offset)
        }) {
            return index
        }
        
        return nil
    }
}

@available(iOS 18.4, *)
fileprivate struct CustomScrollTarget: ScrollTargetBehavior {
    @Binding var tabs: [GlassSegmentedControl.Tab]
    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let offset = target.rect.origin.x
        
        target.rect.origin.x = tabs.closetSnapPoint(offset)
    }
    
    /// OPTIONAL: FOR FAST DECELERATION!
    func properties(context: PropertiesContext) -> Properties {
        var properties = Properties()
        properties.limitsScrolls = true
        return properties
    }
}
