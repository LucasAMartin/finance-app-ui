import ExpoModulesCore
import SwiftUI

// Holds the React Native child views. Lives as a UIKit sibling ON TOP of the
// glass host (not inside the SwiftUI hierarchy) — SwiftUI's Liquid Glass
// composites above any UIView hosted within its controller, so the content has
// to be a separate UIKit layer to stay crisp.
final class RNChildrenView: UIView {}

// SwiftUI layer: glass material only. Sits behind the RN content as its own
// UIView. When pressable it's the content of an interactive Button so the
// native spring + finger-tracking refraction fire on press.
//
// The GlassEffectContainer is REQUIRED for the interactive press/refraction —
// without it iOS renders the static glass material but skips the reactive
// effect (same gotcha as GlassCircleButton). Do not add .buttonStyle(.plain):
// it strips the interactive rendering.
@available(iOS 26.0, *)
private struct GlassCardBody: View {
  let cornerRadius: CGFloat
  let pressable: Bool
  let onTap: () -> Void

  var body: some View {
    GlassEffectContainer {
      if pressable {
        Button(action: onTap) {
          Color.clear.contentShape(.rect(cornerRadius: cornerRadius))
        }
        .glassEffect(.regular.interactive(), in: .rect(cornerRadius: cornerRadius))
      } else {
        Color.clear
          .glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
      }
    }
  }
}

// ExpoView subclass exposed to React Native.
// Layers: glassHost (back, SwiftUI) + childrenView (front, RN content).
public class GlassCardView: ExpoView {
  let onCardPress = EventDispatcher()

  var cornerRadius: CGFloat = 24 { didSet { if cornerRadius != oldValue { rebuildIfNeeded() } } }
  var isPressable: Bool = false  { didSet { if isPressable != oldValue { rebuildIfNeeded() } } }

  private let childrenView = RNChildrenView()
  private var hostingVC: UIHostingController<AnyView>?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    if #available(iOS 26.0, *) { rebuildSwiftUI() }
    addSubview(childrenView) // on top of the glass
  }

  private func rebuildIfNeeded() {
    if #available(iOS 26.0, *) { rebuildSwiftUI() }
  }

  @available(iOS 26.0, *)
  private func rebuildSwiftUI() {
    hostingVC?.view.removeFromSuperview()
    let body = GlassCardBody(
      cornerRadius: cornerRadius,
      pressable: isPressable,
      onTap: { [weak self] in self?.onCardPress([:]) }
    )
    let hvc = UIHostingController(rootView: AnyView(body))
    hvc.view.backgroundColor = .clear
    insertSubview(hvc.view, at: 0) // behind childrenView
    hostingVC = hvc
    setNeedsLayout()
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    hostingVC?.view.frame = bounds
    childrenView.frame = bounds
    // Z-order, made deterministic regardless of rebuild/insert timing.
    if let host = hostingVC?.view { sendSubviewToBack(host) }
    bringSubviewToFront(childrenView)
  }

  // Pressable cards are a single tap target: route every in-bounds touch to the
  // SwiftUI glass Button so the interactive effect fires and onCardPress is sent.
  // Static cards fall through to default hit testing so RN content (and any
  // inner controls) stay interactive.
  public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard !isHidden, isUserInteractionEnabled, alpha > 0.01, bounds.contains(point) else {
      return super.hitTest(point, with: event)
    }
    if isPressable, let host = hostingVC?.view {
      let local = host.convert(point, from: self)
      return host.hitTest(local, with: event) ?? host
    }
    return super.hitTest(point, with: event)
  }

  // RN children land in `childrenView`. Yoga sizes GlassCardView from the JS
  // shadow tree; childrenView shares the same origin (frame = bounds), so the
  // Yoga-computed child frames line up.
  override public func insertReactSubview(_ subview: UIView!, at atIndex: Int) {
    childrenView.insertSubview(subview, at: atIndex)
  }

  override public func removeReactSubview(_ subview: UIView!) {
    subview.removeFromSuperview()
  }

  override public func reactSubviews() -> [UIView]! {
    childrenView.subviews
  }
}
