import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class NativeLGToastViewProps: UIBaseViewProps {
  @Field var toastKey: Int = 0
  @Field var title: String = ""
  @Field var symbol: String? = nil
  @Field var actionTitle: String? = nil
  @Field var duration: Double = 3
  @Field var placementOffset: Double = -60
  @Field var isDark: Bool = false
  var onAction = EventDispatcher()
  var onDismiss = EventDispatcher()
}

public struct NativeLGToastView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeLGToastViewProps

  public init(props: NativeLGToastViewProps) {
    self.props = props
  }

  public var body: some View {
    NativeLGToastRootView(
      toastKey: props.toastKey,
      title: props.title,
      symbol: props.symbol,
      actionTitle: props.actionTitle,
      duration: CGFloat(props.duration),
      placementOffset: CGFloat(props.placementOffset),
      onAction: { props.onAction([:]) },
      onDismiss: { props.onDismiss([:]) }
    )
    .preferredColorScheme(props.isDark ? .dark : .light)
  }
}

private struct NativeLGToastRootView: View {
  let toastKey: Int
  let title: String
  let symbol: String?
  let actionTitle: String?
  let duration: CGFloat
  let placementOffset: CGFloat
  let onAction: () -> Void
  let onDismiss: () -> Void
  /// View Properties
  @State private var activeToast: LGToast?
  @State private var toastDismissWorkItem: DispatchWorkItem?

  var body: some View {
    Color.clear
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .overlay(alignment: .bottom) {
        if #available(iOS 26.0, *) {
          GlassEffectContainer(spacing: 10) {
            if let activeToast {
              ToastView(activeToast)
            }
          }
          .opacity(activeToast == nil ? 0 : 1)
        } else {
          if let activeToast {
            ToastView(activeToast)
              .opacity(activeToast == nil ? 0 : 1)
          }
        }
      }
      .onChange(of: toastKey) { _, _ in
        guard !title.isEmpty else {
          dismiss(notify: false)
          return
        }

        showToast(.init(
          title: title,
          duration: duration,
          placementOffset: placementOffset,
          symbol: symbol,
          actionTitle: actionTitle,
          action: {
            onAction()
            return true
          }
        ))
      }
  }

  private func showToast(_ toast: LGToast) {
    withAnimation(animation.logicallyComplete(after: 0.17), completionCriteria: .logicallyComplete) {
      /// Removing old toast to show the updated one!
      if activeToast != nil {
        activeToast = nil
      }
    } completion: {
      toastDismissWorkItem?.cancel()

      withAnimation(animation) {
        activeToast = toast
      }

      toastDismissWorkItem = .init(block: {
        dismiss(notify: true)
      })
      /// Limiting the minimum duration to 1!
      let duration = max(toast.duration, 1)
      if let toastDismissWorkItem {
        DispatchQueue.main.asyncAfter(
          deadline: .now() + duration,
          execute: toastDismissWorkItem
        )
      }
    }
  }

  @ViewBuilder
  private func ToastView(_ toast: LGToast) -> some View {
    HStack(spacing: 10) {
      if let symbol = toast.symbol {
        Image(systemName: symbol)
          .font(.title3)
          .foregroundStyle(Color.primary)
          .transition(.identity)
      }

      Text(toast.title)
        .font(.body)
        .lineLimit(1)

      Spacer(minLength: 0)

      if let actionTitle = toast.actionTitle, let action = toast.action {
        Button {
          /// If true, then dismiss the toast!
          if action() {
            dismiss(notify: false)
          }
        } label: {
          Text(actionTitle)
            .foregroundStyle(toast.actionTint)
        }
        .transition(.identity)
      }
    }
    .padding(.horizontal, 18)
    .frame(height: 50)
    .clipShape(.capsule)
    .contentShape(.capsule)
    .lgToastGlassEffect()
    .padding(.horizontal, 15)
    /// Placement offset
    .offset(y: toast.placementOffset)
    .gesture(
      DragGesture()
        .onEnded { value in
          let endTranslation = value.translation.height
          if endTranslation > 30 {
            dismiss(notify: true)
          }
        }
    )
    /// Offset Transition
    .transition(.offset(y: toast.transitionOffset))
  }

  private func dismiss(notify: Bool) {
    withAnimation(animation) {
      activeToast = nil
    }

    toastDismissWorkItem?.cancel()

    if notify {
      onDismiss()
    }
  }

  private let animation: Animation = .interpolatingSpring(duration: 0.35, bounce: 0, initialVelocity: 0)
}

private struct LGToast: Identifiable {
  private(set) var id: String = UUID().uuidString
  /// Toast Properties!
  var title: String
  var duration: CGFloat
  var placementOffset: CGFloat
  var transitionOffset: CGFloat = 100
  var symbol: String? = nil
  var actionTitle: String? = nil
  var actionTint: Color = .accentColor
  var action: (() -> Bool)? = nil
}

private extension View {
  @ViewBuilder
  func lgToastGlassEffect() -> some View {
    if #available(iOS 26.0, *) {
      self.glassEffect(.regular, in: .capsule)
    } else {
      self.background(.regularMaterial, in: .capsule)
    }
  }
}
