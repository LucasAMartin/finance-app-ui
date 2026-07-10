import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeSpendLineChartViewProps: UIBaseViewProps {
  @Field var valuesJson: String = "[]"
  @Field var color: String = "#4E8FDB"
  @Field var fillColor: String = ""
  @Field var ringColor: String = "#FFFFFF"
  @Field var strokeWidth: Double = 2.5
  @Field var verticalInset: Double = 0
  @Field var bottomInset: Double = 0
  @Field var selectedIndex: Int = -1
  @Field var play: Bool = true
  @Field var haptics: Bool = true
  @Field var replayToken: Int = 0
  @Field var animationDurationMs: Double = 950
  @Field var scrubEnabled: Bool = true
  @Field var tapEnabled: Bool = false
  var onScrub = EventDispatcher()
  var onTap = EventDispatcher()
}

public struct NativeSpendLineChartView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeSpendLineChartViewProps

  public init(props: NativeSpendLineChartViewProps) {
    self.props = props
  }

  public var body: some View {
    NativeSpendLineChartContent(
      values: decodedValues,
      color: Color.financeChartColor(props.color, fallback: .blue),
      fillColor: Color.financeChartColor(props.fillColor.isEmpty ? props.color : props.fillColor, fallback: .blue),
      ringColor: Color.financeChartColor(props.ringColor, fallback: .white),
      strokeWidth: CGFloat(props.strokeWidth),
      verticalInset: props.verticalInset > 0 ? CGFloat(props.verticalInset) : nil,
      bottomInset: props.bottomInset > 0 ? CGFloat(props.bottomInset) : nil,
      selectedIndex: props.selectedIndex,
      play: props.play,
      haptics: props.haptics,
      replayToken: props.replayToken,
      animationDuration: max(0.05, props.animationDurationMs / 1000.0),
      scrubEnabled: props.scrubEnabled,
      tapEnabled: props.tapEnabled,
      onScrub: { index in
        if let index {
          props.onScrub(["index": index])
        } else {
          props.onScrub(["index": NSNull()])
        }
      },
      onTap: { index in
        props.onTap(["index": index])
      }
    )
  }

  private var decodedValues: [Double] {
    guard let data = props.valuesJson.data(using: .utf8) else {
      return []
    }
    return (try? JSONDecoder().decode([Double].self, from: data)) ?? []
  }
}

private struct NativeSpendLineChartContent: View {
  let values: [Double]
  let color: Color
  let fillColor: Color
  let ringColor: Color
  let strokeWidth: CGFloat
  let verticalInset: CGFloat?
  let bottomInset: CGFloat?
  let selectedIndex: Int
  let play: Bool
  let haptics: Bool
  let replayToken: Int
  let animationDuration: TimeInterval
  let scrubEnabled: Bool
  let tapEnabled: Bool
  let onScrub: (Int?) -> Void
  let onTap: (Int) -> Void

  @State private var animationStart: Date?
  @State private var frameDate = Date()
  @State private var isScrubbing: Bool = false
  @State private var lastHapticIndex: Int?
  @State private var feedback = UISelectionFeedbackGenerator()

  private let frameTimer = Timer.publish(every: 1.0 / 60.0, on: .main, in: .common).autoconnect()

  var body: some View {
    GeometryReader { proxy in
      let size = proxy.size
      let geometry = ChartGeometry(values: values, size: size, strokeWidth: strokeWidth, verticalInset: verticalInset, bottomInset: bottomInset)
      let activeIndex = selectedIndex >= 0 ? selectedIndex : nil

      ZStack {
        let fillDelay = animationDuration * 0.27
        let lineProgress = animationProgress(at: frameDate, delay: 0, duration: animationDuration)
        let fillProgress = animationProgress(at: frameDate, delay: fillDelay, duration: animationDuration - fillDelay)

        if !values.isEmpty && size.width > 0 && size.height > 0 {
          Canvas { context, _ in
            let area = geometry.areaPath
            context.opacity = fillProgress
            context.fill(
              area,
              with: .linearGradient(
                Gradient(stops: [
                  .init(color: fillColor.opacity(0.22), location: 0),
                  .init(color: fillColor.opacity(0.06), location: 0.55),
                  .init(color: fillColor.opacity(0), location: 1),
                ]),
                startPoint: CGPoint(x: size.width / 2, y: 0),
                endPoint: CGPoint(x: size.width / 2, y: size.height)
              )
            )

            context.stroke(
              geometry.linePath.trimmedPath(from: 0, to: lineProgress),
              with: .color(color),
              style: StrokeStyle(
                lineWidth: strokeWidth,
                lineCap: .round,
                lineJoin: .round
              )
            )

            if let activeIndex, geometry.points.indices.contains(activeIndex) {
              let point = geometry.points[activeIndex]
              var cursorLine = Path()
              cursorLine.move(to: CGPoint(x: point.x, y: geometry.padTop))
              cursorLine.addLine(to: CGPoint(x: point.x, y: size.height - geometry.padBottom))
              context.stroke(
                cursorLine,
                with: .color(color.opacity(0.35)),
                style: StrokeStyle(lineWidth: 1.5, lineCap: .round)
              )

              let halo = Path(ellipseIn: CGRect(x: point.x - 11, y: point.y - 11, width: 22, height: 22))
              context.fill(halo, with: .color(color.opacity(0.16)))

              let dot = Path(ellipseIn: CGRect(x: point.x - 6, y: point.y - 6, width: 12, height: 12))
              context.fill(dot, with: .color(color))
              context.stroke(dot, with: .color(ringColor), lineWidth: 2.5)
            }
          }
          .animation(.easeOut(duration: 0.13), value: activeIndex)
        }
      }
      .contentShape(Rectangle())
      .nativeSpendOptionalScrubGesture(scrubGesture(geometry: geometry), enabled: scrubEnabled)
      .nativeSpendOptionalTapGesture(tapGesture(geometry: geometry), enabled: tapEnabled)
      .onChange(of: play) { _, _ in
        replay()
      }
      .onChange(of: replayToken) { _, _ in
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

  private func animationProgress(at date: Date, delay: TimeInterval, duration: TimeInterval) -> CGFloat {
    guard play, let animationStart else { return 0 }
    let raw = (date.timeIntervalSince(animationStart) - delay) / duration
    return easeOutCubic(CGFloat(min(max(raw, 0), 1)))
  }

  private func isAnimationActive(at date: Date) -> Bool {
    guard play, let animationStart else { return false }
    return date.timeIntervalSince(animationStart) <= animationDuration
  }

  private func easeOutCubic(_ progress: CGFloat) -> CGFloat {
    let value = Double(progress)
    return CGFloat(1 - pow(1 - value, 3))
  }

  private func tapGesture(geometry: ChartGeometry) -> some Gesture {
    SpatialTapGesture()
      .onEnded { value in
        guard !isScrubbing, !geometry.points.isEmpty else { return }
        let index = geometry.index(for: value.location.x)
        fireHapticIfNeeded(index)
        lastHapticIndex = nil
        onTap(index)
      }
  }

  private func scrubGesture(geometry: ChartGeometry) -> some Gesture {
    LongPressGesture(minimumDuration: 0.14)
      .sequenced(before: DragGesture(minimumDistance: 0))
      .onChanged { value in
        guard !geometry.points.isEmpty else { return }

        switch value {
        case .first:
          break
        case .second(true, let drag):
          guard let drag else { return }
          isScrubbing = true
          let index = geometry.index(for: drag.location.x)
          onScrub(index)
          fireHapticIfNeeded(index)
        default:
          break
        }
      }
      .onEnded { _ in
        isScrubbing = false
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

private extension View {
  @ViewBuilder
  func nativeSpendOptionalScrubGesture<G: Gesture>(_ gesture: G, enabled: Bool) -> some View {
    if enabled {
      self.simultaneousGesture(gesture)
    } else {
      self
    }
  }

  @ViewBuilder
  func nativeSpendOptionalTapGesture<G: Gesture>(_ gesture: G, enabled: Bool) -> some View {
    if enabled {
      self.simultaneousGesture(gesture)
    } else {
      self
    }
  }
}

private struct ChartGeometry {
  let values: [Double]
  let size: CGSize
  let strokeWidth: CGFloat
  let verticalInset: CGFloat?
  let bottomInset: CGFloat?

  var padX: CGFloat {
    strokeWidth + 1
  }

  var padTop: CGFloat {
    max(strokeWidth + 1, verticalInset ?? strokeWidth + 1)
  }

  var padBottom: CGFloat {
    max(strokeWidth + 1, bottomInset ?? verticalInset ?? strokeWidth + 1)
  }

  var points: [CGPoint] {
    guard !values.isEmpty else { return [] }
    let maxValue = max(values.max() ?? 0, 0)
    let minValue = min(values.min() ?? 0, 0)
    let range = max(maxValue - minValue, 1)
    let innerHeight = max(0, size.height - padTop - padBottom)
    let stepX = values.count > 1 ? (size.width - padX * 2) / CGFloat(values.count - 1) : 0

    return values.enumerated().map { index, value in
      let x = padX + CGFloat(index) * stepX
      let y = padTop + (1 - CGFloat((value - minValue) / range)) * innerHeight
      return CGPoint(x: x, y: y)
    }
  }

  var linePath: Path {
    smoothPath(points)
  }

  var areaPath: Path {
    var path = linePath
    guard let first = points.first, let last = points.last else {
      return path
    }
    path.addLine(to: CGPoint(x: last.x, y: size.height - padBottom))
    path.addLine(to: CGPoint(x: first.x, y: size.height - padBottom))
    path.closeSubpath()
    return path
  }

  var dashLength: CGFloat {
    guard points.count > 1 else { return 1 }
    var length: CGFloat = 0
    for index in 1..<points.count {
      let previous = points[index - 1]
      let current = points[index]
      length += hypot(current.x - previous.x, current.y - previous.y)
    }
    return max(1, length * 1.25)
  }

  func index(for x: CGFloat) -> Int {
    guard values.count > 1 else { return 0 }
    let stepX = (size.width - padX * 2) / CGFloat(values.count - 1)
    guard stepX > 0 else { return 0 }
    return max(0, min(values.count - 1, Int(round((x - padX) / stepX))))
  }

  private func smoothPath(_ points: [CGPoint]) -> Path {
    var path = Path()
    guard let first = points.first else { return path }
    path.move(to: first)
    guard points.count > 1 else { return path }

    for index in 0..<(points.count - 1) {
      let p0 = points.indices.contains(index - 1) ? points[index - 1] : points[index]
      let p1 = points[index]
      let p2 = points[index + 1]
      let p3 = points.indices.contains(index + 2) ? points[index + 2] : p2

      let cp1 = CGPoint(
        x: p1.x + (p2.x - p0.x) / 6,
        y: p1.y + (p2.y - p0.y) / 6
      )
      let cp2 = CGPoint(
        x: p2.x - (p3.x - p1.x) / 6,
        y: p2.y - (p3.y - p1.y) / 6
      )
      path.addCurve(to: p2, control1: cp1, control2: cp2)
    }

    return path
  }
}

private extension Color {
  static func financeChartColor(_ raw: String, fallback: Color) -> Color {
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
