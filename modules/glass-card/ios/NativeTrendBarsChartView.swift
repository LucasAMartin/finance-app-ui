import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeTrendBarsChartViewProps: UIBaseViewProps {
  @Field var valuesJson: String = "[]"
  @Field var labelsJson: String = "[]"
  @Field var selectedIndex: Int = -1
  @Field var barColor: String = "#4E8FDB"
  @Field var selectedColor: String = "#4E8FDB"
  @Field var labelColor: String = "#8A8A8E"
  @Field var selectedLabelColor: String = "#111111"
  @Field var partialIndex: Int = -1
  @Field var play: Bool = true
  @Field var haptics: Bool = true
  var onScrub = EventDispatcher()
}

public struct NativeTrendBarsChartView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeTrendBarsChartViewProps

  public init(props: NativeTrendBarsChartViewProps) {
    self.props = props
  }

  public var body: some View {
    NativeTrendBarsChartContent(
      values: decodedValues,
      labels: decodedLabels,
      selectedIndex: props.selectedIndex,
      barColor: Color.nativeTrendChartColor(props.barColor, fallback: .blue),
      selectedColor: Color.nativeTrendChartColor(props.selectedColor, fallback: .blue),
      labelColor: Color.nativeTrendChartColor(props.labelColor, fallback: .secondary),
      selectedLabelColor: Color.nativeTrendChartColor(props.selectedLabelColor, fallback: .primary),
      partialIndex: props.partialIndex,
      play: props.play,
      haptics: props.haptics,
      onScrub: { index in
        if let index {
          props.onScrub(["index": index])
        } else {
          props.onScrub(["index": NSNull()])
        }
      }
    )
  }

  private var decodedValues: [Double] {
    guard let data = props.valuesJson.data(using: .utf8) else {
      return []
    }
    return (try? JSONDecoder().decode([Double].self, from: data)) ?? []
  }

  private var decodedLabels: [String] {
    guard let data = props.labelsJson.data(using: .utf8) else {
      return []
    }
    return (try? JSONDecoder().decode([String].self, from: data)) ?? []
  }
}

private struct NativeTrendBarsChartContent: View {
  let values: [Double]
  let labels: [String]
  let selectedIndex: Int
  let barColor: Color
  let selectedColor: Color
  let labelColor: Color
  let selectedLabelColor: Color
  let partialIndex: Int
  let play: Bool
  let haptics: Bool
  let onScrub: (Int?) -> Void

  @State private var animationStart: Date?
  @State private var frameDate = Date()
  @State private var lastHapticIndex: Int?
  @State private var feedback = UISelectionFeedbackGenerator()

  private let padT: CGFloat = 6
  private let padB: CGFloat = 16
  private let stagger: Double = 0.058
  private let growDuration: Double = 0.6
  private let frameTimer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()

  var body: some View {
    GeometryReader { proxy in
      let size = proxy.size
      let geometry = NativeTrendBarsGeometry(values: values, size: size, padT: padT, padB: padB)

      ZStack {
        Canvas { context, _ in
          guard !values.isEmpty, size.width > 0, size.height > 0 else {
            return
          }

          for index in values.indices {
            guard let bar = geometry.bar(at: index) else { continue }
            let progress = localProgress(for: index, at: frameDate)
            let height = max(0.01, bar.height * progress)
            let rect = CGRect(
              x: bar.x,
              y: geometry.baseY - height,
              width: geometry.barWidth,
              height: height
            )
            let fill = index == selectedIndex ? selectedColor : barColor
            let path = Path(roundedRect: rect, cornerRadius: min(4, geometry.barWidth / 2))
            context.opacity = index == partialIndex && index != selectedIndex ? 0.5 : 1
            context.fill(path, with: .color(fill))
            context.opacity = 1
          }

          for index in labels.indices {
            let label = labels[index]
            let textColor = index == selectedIndex ? selectedLabelColor : labelColor
            let weight: Font.Weight = index == selectedIndex ? .bold : .medium
            let text = context.resolve(
              Text(label)
                .font(.system(size: 9, weight: weight))
                .foregroundStyle(textColor)
            )
            context.draw(
              text,
              at: CGPoint(x: geometry.band * CGFloat(index) + geometry.band / 2, y: size.height - 7),
              anchor: .center
            )
          }
        }
      }
      .contentShape(Rectangle())
      .simultaneousGesture(scrubGesture(geometry: geometry))
      .onChange(of: play) { _, _ in
        replay()
      }
      .onChange(of: valuesKey) { _, _ in
        onScrub(nil)
        replay()
      }
      .onAppear {
        feedback.prepare()
        replay()
      }
      .onReceive(frameTimer) { date in
        guard isAnimationActive(at: date) else { return }
        frameDate = date
      }
    }
  }

  private var valuesKey: String {
    values.map { String(format: "%.4f", $0) }.joined(separator: "|")
  }

  private func localProgress(for index: Int, at date: Date) -> CGFloat {
    guard play, let animationStart else { return 0 }
    let delay = Double(index) * stagger
    let raw = (date.timeIntervalSince(animationStart) - delay) / growDuration
    return easeOutCubic(CGFloat(min(max(raw, 0), 1)))
  }

  private func easeOutCubic(_ progress: CGFloat) -> CGFloat {
    let value = Double(progress)
    return CGFloat(1 - pow(1 - value, 3))
  }

  private func isAnimationActive(at date: Date) -> Bool {
    guard play, let animationStart else { return false }
    let finalDelay = Double(max(values.count - 1, 0)) * stagger
    return date.timeIntervalSince(animationStart) <= finalDelay + growDuration
  }

  private func scrubGesture(geometry: NativeTrendBarsGeometry) -> some Gesture {
    LongPressGesture(minimumDuration: 0.14)
      .sequenced(before: DragGesture(minimumDistance: 0))
      .onChanged { value in
        guard values.count > 0 else {
          return
        }

        switch value {
        case .first:
          break
        case .second(true, let drag):
          guard let drag else {
            return
          }
          let index = geometry.index(for: drag.location.x)
          onScrub(index)
          fireHapticIfNeeded(index)
        default:
          break
        }
      }
      .onEnded { _ in
        lastHapticIndex = nil
        onScrub(nil)
      }
  }

  private func replay() {
    guard play else {
      animationStart = nil
      return
    }

    let now = Date()
    animationStart = now
    frameDate = now
  }

  private func fireHapticIfNeeded(_ index: Int) {
    guard haptics, lastHapticIndex != index else { return }
    lastHapticIndex = index
    feedback.selectionChanged()
    feedback.prepare()
  }
}

private struct NativeTrendBarsGeometry {
  let values: [Double]
  let size: CGSize
  let padT: CGFloat
  let padB: CGFloat

  var count: Int {
    values.count
  }

  var plotHeight: CGFloat {
    max(0, size.height - padT - padB)
  }

  var maxValue: Double {
    max(1, values.max() ?? 1)
  }

  var band: CGFloat {
    size.width / CGFloat(max(count, 1))
  }

  var barWidth: CGFloat {
    min(22, max(7, band * 0.5))
  }

  var baseY: CGFloat {
    padT + plotHeight
  }

  func bar(at index: Int) -> (x: CGFloat, height: CGFloat)? {
    guard values.indices.contains(index), count > 0 else {
      return nil
    }
    let height = max(2, CGFloat(values[index] / maxValue) * plotHeight)
    let x = CGFloat(index) * band + (band - barWidth) / 2
    return (x, height)
  }

  func index(for x: CGFloat) -> Int {
    guard count > 0, band > 0 else { return 0 }
    return max(0, min(count - 1, Int(floor(x / band))))
  }
}

private extension Color {
  static func nativeTrendChartColor(_ raw: String, fallback: Color) -> Color {
    let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("rgba("), value.hasSuffix(")") {
      let body = value.dropFirst(5).dropLast()
      let parts = body.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      guard parts.count == 4,
            let r = Double(parts[0]),
            let g = Double(parts[1]),
            let b = Double(parts[2]),
            let a = Double(parts[3]) else {
        return fallback
      }
      return Color(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: a)
    }

    if value.hasPrefix("#") {
      let hex = String(value.dropFirst())
      let scanner = Scanner(string: hex)
      var int: UInt64 = 0
      guard scanner.scanHexInt64(&int) else { return fallback }

      if hex.count == 6 {
        return Color(
          .sRGB,
          red: Double((int >> 16) & 0xff) / 255,
          green: Double((int >> 8) & 0xff) / 255,
          blue: Double(int & 0xff) / 255,
          opacity: 1
        )
      }

      if hex.count == 8 {
        return Color(
          .sRGB,
          red: Double((int >> 24) & 0xff) / 255,
          green: Double((int >> 16) & 0xff) / 255,
          blue: Double((int >> 8) & 0xff) / 255,
          opacity: Double(int & 0xff) / 255
        )
      }
    }

    return fallback
  }
}
