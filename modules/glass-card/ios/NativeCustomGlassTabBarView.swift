import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeCustomGlassTabBarViewProps: UIBaseViewProps {
  @Field var activeTab: String = "home"
  @Field var isDark: Bool = false
  @Field var usesExternalVoiceTrigger: Bool = false
  var onTabSelect = EventDispatcher()
  var onVoiceAction = EventDispatcher()
}

public struct NativeCustomGlassTabBarView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeCustomGlassTabBarViewProps

  public init(props: NativeCustomGlassTabBarViewProps) {
    self.props = props
  }

  public var body: some View {
    if #available(iOS 26.0, *) {
      NativeCustomGlassTabBarContent(
        activeTabID: props.activeTab,
        isDark: props.isDark,
        usesExternalVoiceTrigger: props.usesExternalVoiceTrigger,
        onTabSelect: { tab in props.onTabSelect(["tabId": tab.id]) },
        onVoiceAction: { props.onVoiceAction([:]) }
      )
    } else {
      NativeCustomGlassTabBarFallback(
        activeTabID: props.activeTab,
        isDark: props.isDark,
        usesExternalVoiceTrigger: props.usesExternalVoiceTrigger,
        onTabSelect: { tab in props.onTabSelect(["tabId": tab.id]) },
        onVoiceAction: { props.onVoiceAction([:]) }
      )
    }
  }
}

private enum FinanceGlassTab: String, CaseIterable {
  case home = "Home"
  case spending = "Spending"
  case budget = "Budget"
  case activity = "Activity"

  var id: String {
    switch self {
    case .home: return "home"
    case .spending: return "spending"
    case .budget: return "budget"
    case .activity: return "activity"
    }
  }

  var symbol: String {
    switch self {
    case .home: return "house"
    case .spending: return "chart.bar"
    case .budget: return "chart.pie"
    case .activity: return "list.bullet.rectangle"
    }
  }

  var index: Int {
    Self.allCases.firstIndex(of: self) ?? 0
  }

  static func from(id: String) -> FinanceGlassTab {
    Self.allCases.first(where: { $0.id == id }) ?? .home
  }
}

@available(iOS 26.0, *)
private struct NativeCustomGlassTabBarContent: View {
  let activeTabID: String
  let isDark: Bool
  let usesExternalVoiceTrigger: Bool
  let onTabSelect: (FinanceGlassTab) -> Void
  let onVoiceAction: () -> Void

  @State private var activeTab: FinanceGlassTab

  init(
    activeTabID: String,
    isDark: Bool,
    usesExternalVoiceTrigger: Bool,
    onTabSelect: @escaping (FinanceGlassTab) -> Void,
    onVoiceAction: @escaping () -> Void
  ) {
    self.activeTabID = activeTabID
    self.isDark = isDark
    self.usesExternalVoiceTrigger = usesExternalVoiceTrigger
    self.onTabSelect = onTabSelect
    self.onVoiceAction = onVoiceAction
    _activeTab = State(initialValue: FinanceGlassTab.from(id: activeTabID))
  }

  var body: some View {
    GlassEffectContainer(spacing: 10) {
      HStack(spacing: 10) {
        GeometryReader {
          NativeCustomTabBar(
            size: $0.size,
            activeTint: .primary,
            inActiveTint: .primary.opacity(0.5),
            barTint: .gray.opacity(0.3),
            activeTab: $activeTab,
            onTabSelect: onTabSelect
          ) { tab in
            VStack(spacing: 3) {
              Image(systemName: tab.symbol)
                .font(.title3)

              Text(tab.rawValue)
                .font(.system(size: 10))
                .fontWeight(.medium)
            }
            .symbolVariant(.fill)
            .frame(maxWidth: .infinity)
          }
          .glassEffect(.regular.interactive(), in: .capsule)
        }

        Button(action: {
          guard !usesExternalVoiceTrigger else { return }
          onVoiceAction()
        }) {
          Image(systemName: "mic.fill")
            .font(.system(size: 22, weight: .medium))
            .foregroundStyle(Color.primary)
            .frame(width: 55, height: 55)
            .contentShape(.capsule)
        }
        .glassEffect(.regular.interactive(), in: .capsule)
        .allowsHitTesting(!usesExternalVoiceTrigger)
        .accessibilityHidden(usesExternalVoiceTrigger)
        .animation(.smooth(duration: 0.55, extraBounce: 0), value: activeTab)
        .accessibilityLabel(Text("Add expense"))
      }
    }
    .frame(height: 55)
    .preferredColorScheme(isDark ? .dark : .light)
    .onChange(of: activeTabID) { _, nextID in
      let next = FinanceGlassTab.from(id: nextID)
      if activeTab != next {
        activeTab = next
      }
    }
  }
}

private struct NativeCustomGlassTabBarFallback: View {
  let activeTabID: String
  let isDark: Bool
  let usesExternalVoiceTrigger: Bool
  let onTabSelect: (FinanceGlassTab) -> Void
  let onVoiceAction: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      ForEach(FinanceGlassTab.allCases, id: \.id) { tab in
        Button {
          onTabSelect(tab)
        } label: {
          Image(systemName: tab.symbol)
            .symbolVariant(.fill)
            .foregroundStyle(FinanceGlassTab.from(id: activeTabID) == tab ? Color.primary : Color.primary.opacity(0.5))
            .frame(maxWidth: .infinity)
        }
      }

      Button(action: {
        guard !usesExternalVoiceTrigger else { return }
        onVoiceAction()
      }) {
        Image(systemName: "mic.fill")
          .foregroundStyle(Color.primary)
          .frame(width: 55, height: 55)
      }
      .allowsHitTesting(!usesExternalVoiceTrigger)
      .accessibilityHidden(usesExternalVoiceTrigger)
    }
    .frame(height: 55)
    .preferredColorScheme(isDark ? .dark : .light)
  }
}

private struct NativeCustomTabBar<TabItemView: View>: UIViewRepresentable {
  var size: CGSize
  var activeTint: Color = .primary
  var inActiveTint: Color = .primary.opacity(0.45)
  var barTint: Color = .gray.opacity(0.2)
  @Binding var activeTab: FinanceGlassTab
  var onTabSelect: (FinanceGlassTab) -> Void
  @ViewBuilder var tabItemView: (FinanceGlassTab) -> TabItemView

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  func makeUIView(context: Context) -> UISegmentedControl {
    let items = FinanceGlassTab.allCases.map(\.rawValue)
    let control = UISegmentedControl(items: items)
    control.selectedSegmentIndex = activeTab.index
    configure(control)
    control.addTarget(context.coordinator, action: #selector(context.coordinator.tabSelected(_:)), for: .valueChanged)
    return control
  }

  func updateUIView(_ uiView: UISegmentedControl, context: Context) {
    context.coordinator.parent = self
    if uiView.selectedSegmentIndex != activeTab.index {
      uiView.selectedSegmentIndex = activeTab.index
    }
    configure(uiView)
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: UISegmentedControl, context: Context) -> CGSize? {
    return size
  }

  private func configure(_ control: UISegmentedControl) {
    for (index, tab) in FinanceGlassTab.allCases.enumerated() {
      let renderer = ImageRenderer(content: tabItemView(tab))
      /// 2 is enough, but you can change it as per your wish!
      renderer.scale = 2
      let image = renderer.uiImage
      control.setImage(image, forSegmentAt: index)
    }

    DispatchQueue.main.async {
      for subview in control.subviews {
        if subview is UIImageView && subview != control.subviews.last {
          /// It's a background Image View!
          subview.alpha = 0
        }
      }
    }

    control.selectedSegmentTintColor = UIColor(barTint)
    control.setTitleTextAttributes([
      .foregroundColor: UIColor(activeTint)
    ], for: .selected)
    control.setTitleTextAttributes([
      .foregroundColor: UIColor(inActiveTint)
    ], for: .normal)
  }

  class Coordinator: NSObject {
    var parent: NativeCustomTabBar
    init(parent: NativeCustomTabBar) {
      self.parent = parent
    }

    @objc func tabSelected(_ control: UISegmentedControl) {
      guard FinanceGlassTab.allCases.indices.contains(control.selectedSegmentIndex) else {
        return
      }
      let tab = FinanceGlassTab.allCases[control.selectedSegmentIndex]
      parent.activeTab = tab
      parent.onTabSelect(tab)
    }
  }
}

private extension View {
  @ViewBuilder
  func blurFade(_ status: Bool) -> some View {
    self
      .compositingGroup()
      .blur(radius: status ? 0 : 10)
      .opacity(status ? 1 : 0)
  }
}
