import ExpoModulesCore
import ExpoUI
import SwiftUI

public final class NativeDynamicHeightSheetViewProps: UIBaseViewProps {
  @Field var presentationToken: Int = 0
  @Field var isDark: Bool = false
  var onDismiss = EventDispatcher()
}

public struct NativeDynamicHeightSheetView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeDynamicHeightSheetViewProps

  public init(props: NativeDynamicHeightSheetViewProps) {
    self.props = props
  }

  public var body: some View {
    NativeDynamicHeightSheetPresenter(
      presentationToken: props.presentationToken,
      isDark: props.isDark,
      onDismiss: {
        props.onDismiss([:])
      }
    )
  }
}

private struct NativeDynamicHeightSheetPresenter: View {
  let presentationToken: Int
  let isDark: Bool
  let onDismiss: () -> Void

  @State private var lastPresentationToken: Int = 0
  @State private var showTrayView: Bool = false

  var body: some View {
    Color.clear
      .frame(width: 1, height: 1)
      .preferredColorScheme(isDark ? .dark : .light)
      .onAppear {
        presentIfNeeded(presentationToken)
      }
      .onChange(of: presentationToken) { newValue in
        presentIfNeeded(newValue)
      }
      .sheet(isPresented: $showTrayView) {
        if #available(iOS 26.0, *) {
          let animation: Animation = .snappy(duration: 0.3, extraBounce: 0)
          DynamicSheet(animation: animation) {
            TrayView(animation: animation)
          }
        } else {
          VStack(spacing: 12) {
            Text("Dynamic Sheet")
              .font(.headline)
            Text("This demo requires iOS 26.")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          .padding(24)
          .presentationDetents([.medium])
        }
      }
      .onChange(of: showTrayView) { isPresented in
        if !isPresented {
          onDismiss()
        }
      }
  }

  private func presentIfNeeded(_ token: Int) {
    guard token > 0, token != lastPresentationToken else {
      return
    }

    lastPresentationToken = token
    showTrayView = true
  }
}
