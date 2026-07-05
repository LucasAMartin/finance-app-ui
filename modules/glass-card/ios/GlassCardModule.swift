import ExpoModulesCore
import ExpoUI
import WidgetKit

public class GlassCardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GlassCard")

    View(GlassCardView.self) {
      // Visual corner radius — should match RADIUS.card (24) or RADIUS.field (14).
      Prop("cornerRadius") { (view: GlassCardView, value: Double) in
        view.cornerRadius = CGFloat(value)
      }

      // Set to true when an onPress handler is wired up. Enables the SwiftUI
      // Button so the interactive spring + refraction animation fires on tap.
      Prop("pressable") { (view: GlassCardView, value: Bool) in
        view.isPressable = value
      }

      Events("onCardPress")
    }

    ExpoUIView(NativeMerchantMarkView.self)
    ExpoUIView(NativePaywallGradientView.self)
    ExpoUIView(NativeIOSStyleOnboardingView.self)

    AsyncFunction("writeFinanceWidgetSnapshot") { (json: String) in
      guard let defaults = UserDefaults(suiteName: "group.com.lucasmartin.financeapp.widgets") else {
        return
      }
      defaults.set(json, forKey: "finance_widget_snapshot")
      defaults.set(Date().timeIntervalSince1970, forKey: "finance_widget_snapshot_updated_at")
      defaults.synchronize()

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
