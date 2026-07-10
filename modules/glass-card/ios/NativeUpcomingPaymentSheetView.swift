import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeUpcomingPaymentSheetViewProps: UIBaseViewProps {
  @Field var presentationToken: Int = 0
  @Field var payloadJson: String = ""
  @Field var isDark: Bool = false
  var onPay = EventDispatcher()
  var onDelete = EventDispatcher()
  var onDueDateChange = EventDispatcher()
  var onDismiss = EventDispatcher()
}

public struct NativeUpcomingPaymentSheetView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeUpcomingPaymentSheetViewProps

  public init(props: NativeUpcomingPaymentSheetViewProps) {
    self.props = props
  }

  public var body: some View {
    NativeUpcomingPaymentSheetPresenter(
      presentationToken: props.presentationToken,
      payloadJson: props.payloadJson,
      isDark: props.isDark,
      onPay: { amount in props.onPay(["amount": amount]) },
      onDelete: { props.onDelete([:]) },
      onDueDateChange: { iso in props.onDueDateChange(["dueDateISO": iso]) },
      onDismiss: { props.onDismiss([:]) }
    )
  }
}

private struct UpcomingPaymentSheetModel: Decodable, Equatable {
  let id: String
  let merchant: String
  let categoryLabel: String?
  let cadenceLabel: String
  let totalAmountText: String?
  let amount: Double
  let editAmount: String
  let amountText: String
  let dueDateText: String
  let dueDateISO: String
  let canEdit: Bool
  let lockedOwnerName: String?
  let currencySymbol: String
  let fallbackSystemName: String
  let iconColor: String
  let iconBgColor: String
  let logoUrl: String?
  let logoBgColor: String?
  let surface: String
  let sheetBg: String
  let chipBg: String
  let text: String
  let textSec: String
  let textTer: String
  let sep: String
  let accent: String
}

private struct NativeUpcomingPaymentSheetPresenter: View {
  let presentationToken: Int
  let payloadJson: String
  let isDark: Bool
  let onPay: (Double) -> Void
  let onDelete: () -> Void
  let onDueDateChange: (String) -> Void
  let onDismiss: () -> Void

  @State private var lastPresentationToken: Int = 0
  @State private var showSheet = false
  @State private var model: UpcomingPaymentSheetModel?

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
      .onChange(of: payloadJson) { newValue in
        guard let nextModel = decodeModel(newValue) else {
          return
        }
        model = nextModel
      }
      .sheet(isPresented: $showSheet) {
        if let model {
          if #available(iOS 26.0, *) {
            let animation: Animation = .snappy(duration: 0.3, extraBounce: 0)
            DynamicSheet(animation: animation) {
              UpcomingPaymentSheetContent(
                model: model,
                isDark: isDark,
                onPay: onPay,
                onDelete: onDelete,
                onDueDateChange: onDueDateChange
              )
            }
            .presentationDragIndicator(.visible)
          } else {
            UpcomingPaymentSheetContent(
              model: model,
              isDark: isDark,
              onPay: onPay,
              onDelete: onDelete,
              onDueDateChange: onDueDateChange
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
          }
        }
      }
      .onChange(of: showSheet) { isPresented in
        if !isPresented {
          onDismiss()
        }
      }
  }

  private func presentIfNeeded(_ token: Int) {
    guard token > 0, token != lastPresentationToken else {
      return
    }
    guard let nextModel = decodeModel(payloadJson) else {
      return
    }

    lastPresentationToken = token
    model = nextModel
    showSheet = true
  }

  private func decodeModel(_ json: String) -> UpcomingPaymentSheetModel? {
    guard let data = json.data(using: .utf8) else {
      return nil
    }
    return try? JSONDecoder().decode(UpcomingPaymentSheetModel.self, from: data)
  }
}

private struct UpcomingPaymentSheetContent: View {
  let model: UpcomingPaymentSheetModel
  let isDark: Bool
  let onPay: (Double) -> Void
  let onDelete: () -> Void
  let onDueDateChange: (String) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var keypadValue: KeyPadValue
  @State private var dueDate: Date
  @State private var showKeypad = false
  @State private var hasAppeared = false

  init(
    model: UpcomingPaymentSheetModel,
    isDark: Bool,
    onPay: @escaping (Double) -> Void,
    onDelete: @escaping () -> Void,
    onDueDateChange: @escaping (String) -> Void
  ) {
    self.model = model
    self.isDark = isDark
    self.onPay = onPay
    self.onDelete = onDelete
    self.onDueDateChange = onDueDateChange
    _keypadValue = State(initialValue: KeyPadValue(stringValue: Self.centsDigits(from: model.editAmount)))
    _dueDate = State(initialValue: Self.date(from: model.dueDateISO))
  }

  var body: some View {
    ZStack(alignment: .topLeading) {
      Color.clear.ignoresSafeArea()

      Button {
        dismiss()
      } label: {
        Image(systemName: "xmark")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(model.color(.textSec))
          .frame(width: 36, height: 36)
          .background(model.color(.chipBg), in: Circle())
      }
      .buttonStyle(.plain)
      .padding(.leading, 20)
      .padding(.top, 16)
      .zIndex(2)

      VStack(spacing: 0) {
        hero
        fieldCard

        actionArea
          .padding(.top, 18)
      }
      .padding(.top, 32)
      .padding(.horizontal, 20)
      .padding(.bottom, 24)
      .frame(maxWidth: .infinity)

      if model.canEdit {
        keypadOverlay
          .offset(y: showKeypad ? 0 : 360)
          .allowsHitTesting(showKeypad)
          .accessibilityHidden(!showKeypad)
          .animation(.snappy(duration: 0.24, extraBounce: 0), value: showKeypad)
          .zIndex(4)
      }
    }
    .preferredColorScheme(isDark ? .dark : .light)
    .onChange(of: dueDate) { newValue in
      guard hasAppeared, model.canEdit else { return }
      onDueDateChange(Self.isoString(from: newValue))
    }
    .onAppear {
      hasAppeared = true
    }
  }

  private var hero: some View {
    VStack(spacing: 0) {
      UpcomingPaymentMerchantMark(model: model, size: 52)
      Text(model.merchant)
        .font(.title2)
        .fontWeight(.semibold)
        .foregroundStyle(model.color(.text))
        .multilineTextAlignment(.center)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .padding(.top, 8)

      Text(metaLine)
        .font(.system(size: 13, weight: .regular))
        .foregroundStyle(model.color(.textSec))
        .multilineTextAlignment(.center)
        .lineLimit(2)
        .padding(.top, 5)

      HStack(spacing: 1) {
        Text(model.currencySymbol)
        AnimatedCentsTextView(value: $keypadValue)
      }
      .font(.system(size: 32, weight: .medium))
      .foregroundStyle(model.color(.text))
      .monospacedDigit()
      .contentTransition(.numericText())
      .padding(.top, 16)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 12)
    .padding(.bottom, 20)
  }

  private var fieldCard: some View {
    VStack(spacing: 0) {
      Button {
        guard model.canEdit else { return }
        withAnimation(.snappy(duration: 0.24, extraBounce: 0)) {
          showKeypad.toggle()
        }
      } label: {
        HStack(spacing: 12) {
          Text("Amount")
            .font(.system(size: 15, weight: .regular))
            .foregroundStyle(model.color(.textSec))
          Spacer(minLength: 16)
          HStack(spacing: 0) {
            Text(model.currencySymbol)
            AnimatedCentsTextView(value: $keypadValue)
              .foregroundStyle(model.color(.text))
          }
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(model.color(.text))
          .monospacedDigit()
        }
        .contentShape(Rectangle())
        .frame(height: 54)
      }
      .buttonStyle(.plain)
      .disabled(!model.canEdit)
      .opacity(model.canEdit ? 1 : 0.58)

      Rectangle()
        .fill(model.color(.sep))
        .frame(height: 0.5)

      HStack(spacing: 12) {
        Text("Due date")
          .font(.system(size: 15, weight: .regular))
          .foregroundStyle(model.color(.textSec))
        Spacer(minLength: 16)
        DatePicker("", selection: $dueDate, displayedComponents: .date)
          .labelsHidden()
          .tint(model.color(.accent))
          .disabled(!model.canEdit)
          .onTapGesture {
            closeKeypad()
          }
      }
      .frame(height: 54)
      .opacity(model.canEdit ? 1 : 0.58)
    }
    .padding(.horizontal, 16)
    .background(model.color(.chipBg), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
  }

  private var keypadOverlay: some View {
    VStack {
      Color.clear
        .contentShape(Rectangle())
        .onTapGesture {
          closeKeypad()
        }

      VStack(spacing: 8) {
        HStack {
          Spacer()
          Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            closeKeypad()
          } label: {
            Text("Done")
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(isDark ? Color.black : Color.white)
              .padding(.horizontal, 18)
              .frame(height: 36)
              .background(isDark ? Color.white : Color.black, in: Capsule())
          }
          .buttonStyle(.borderless)
        }
        .padding(.horizontal, 12)

        keypad
          .padding(.horizontal, 10)
          .padding(.bottom, 12)
      }
      .padding(.top, 10)
      .background(model.color(.sheetBg), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 24, style: .continuous)
          .stroke(model.color(.sep), lineWidth: 0.5)
      )
      .shadow(color: .black.opacity(isDark ? 0.32 : 0.12), radius: 18, y: 8)
      .compositingGroup()
      .padding(.horizontal, 10)
      .padding(.bottom, 8)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
  }

  private var keypad: some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
      ForEach(1...9, id: \.self) { number in
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          withAnimation(.easeInOut(duration: 0.25)) {
            keypadValue.append(number)
          }
        } label: {
          Text("\(number)")
            .font(.title2.bold())
            .foregroundStyle(model.color(.text))
            .frame(maxWidth: .infinity)
            .frame(height: 62)
            .contentShape(Rectangle())
        }
      }

      Button {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.easeInOut(duration: 0.25)) {
          keypadValue.append(0)
          keypadValue.append(0)
        }
      } label: {
        Text("00")
          .font(.title2.bold())
          .foregroundStyle(model.color(.text))
          .frame(maxWidth: .infinity)
          .frame(height: 62)
          .contentShape(Rectangle())
      }

      ForEach(["0", "delete.backward.fill"], id: \.self) { key in
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          withAnimation(.easeInOut(duration: 0.25)) {
            if key == "0" {
              keypadValue.append(0)
            } else {
              keypadValue.removeLast()
            }
          }
        } label: {
          Group {
            if key == "0" {
              Text("0")
            } else {
              Image(systemName: key)
            }
          }
          .font(.title2.bold())
          .foregroundStyle(model.color(.text))
          .frame(maxWidth: .infinity)
          .frame(height: 62)
          .contentShape(Rectangle())
        }
        .buttonRepeatBehavior(key == "0" ? .disabled : .enabled)
      }
    }
    .buttonStyle(KeypadButtonStyle())
  }

  private var actionArea: some View {
    VStack(spacing: 10) {
      Button {
        guard model.canEdit, let amount = parsedAmount, amount > 0 else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        onPay(amount)
        dismiss()
      } label: {
        HStack(spacing: 1) {
          Text("Pay ")
          Text(model.currencySymbol)
          AnimatedCentsTextView(value: $keypadValue)
        }
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity)
          .frame(height: 52)
          .background(model.canEdit ? model.color(.accent) : model.color(.textTer), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(!model.canEdit)
      .opacity(model.canEdit ? 1 : 0.58)

      if model.canEdit {
        Button(role: .destructive) {
          UIImpactFeedbackGenerator(style: .medium).impactOccurred()
          onDelete()
          dismiss()
        } label: {
          Text("Delete expense")
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
        }
        .buttonStyle(.plain)
      } else {
        Text("\(model.lockedOwnerName ?? "This member") has locked edits for this bill.")
          .font(.system(size: 12))
          .foregroundStyle(model.color(.textSec))
          .multilineTextAlignment(.center)
          .padding(.top, 2)
      }
    }
  }

  private var metaLine: String {
    var parts = [String]()
    if let category = model.categoryLabel, !category.isEmpty {
      parts.append(category)
    }
    parts.append(model.cadenceLabel)
    if let total = model.totalAmountText, !total.isEmpty {
      parts.append("\(total) total")
    }
    return parts.joined(separator: " · ")
  }

  private var parsedAmount: Double? {
    Self.amount(fromCentsDigits: keypadValue.stringValue)
  }

  private func closeKeypad() {
    guard showKeypad else { return }
    withAnimation(.snappy(duration: 0.2, extraBounce: 0)) {
      showKeypad = false
    }
  }

  private static func date(from iso: String) -> Date {
    if let date = ISO8601DateFormatter().date(from: iso) {
      return date
    }
    return Date()
  }

  private static func isoString(from date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }

  private static func centsDigits(from amountText: String) -> String {
    let clean = amountText.filter { "0123456789.".contains($0) }
    guard let amount = Double(clean), amount > 0 else {
      return ""
    }
    return String(Int((amount * 100).rounded()))
  }

  private static func amount(fromCentsDigits digits: String) -> Double? {
    let cents = Int(digits) ?? 0
    return Double(cents) / 100
  }
}

private struct AnimatedCentsTextView: View {
  @Binding var value: KeyPadValue
  @Namespace private var animation

  private struct Token: Identifiable {
    let id: String
    let text: String
    let isInsertedSeparator: Bool
  }

  var body: some View {
    HStack(spacing: 0) {
      ForEach(tokens) { token in
        Text(token.text)
          .contentTransition(token.isInsertedSeparator ? .interpolate : .numericText())
          .transition(.asymmetric(insertion: .push(from: .bottom), removal: .push(from: .top)))
          .matchedGeometryEffect(id: token.id, in: animation)
      }
    }
  }

  private var tokens: [Token] {
    let digits = value.stackViews.filter { !$0.isComma }
    guard !digits.isEmpty else {
      return [
        Token(id: "synthetic-dollar-zero", text: "0", isInsertedSeparator: false),
        Token(id: "decimal", text: ".", isInsertedSeparator: true),
        Token(id: "synthetic-cent-tens-zero", text: "0", isInsertedSeparator: false),
        Token(id: "synthetic-cent-ones-zero", text: "0", isInsertedSeparator: false),
      ]
    }

    let centDigits = Array(digits.suffix(2))
    let dollarDigits = Array(digits.dropLast(min(2, digits.count)))
    var next: [Token] = []

    if dollarDigits.isEmpty {
      next.append(Token(id: "synthetic-dollar-zero", text: "0", isInsertedSeparator: false))
    } else {
      for (index, number) in dollarDigits.enumerated() {
        if index > 0 && (dollarDigits.count - index).isMultiple(of: 3) {
          next.append(Token(id: "comma-\(dollarDigits.count - index)", text: ",", isInsertedSeparator: true))
        }
        next.append(Token(id: number.id, text: number.value, isInsertedSeparator: false))
      }
    }

    next.append(Token(id: "decimal", text: ".", isInsertedSeparator: true))

    if centDigits.count == 0 {
      next.append(Token(id: "synthetic-cent-tens-zero", text: "0", isInsertedSeparator: false))
      next.append(Token(id: "synthetic-cent-ones-zero", text: "0", isInsertedSeparator: false))
    } else if centDigits.count == 1 {
      next.append(Token(id: "synthetic-cent-tens-zero", text: "0", isInsertedSeparator: false))
      next.append(Token(id: centDigits[0].id, text: centDigits[0].value, isInsertedSeparator: false))
    } else {
      next.append(Token(id: centDigits[0].id, text: centDigits[0].value, isInsertedSeparator: false))
      next.append(Token(id: centDigits[1].id, text: centDigits[1].value, isInsertedSeparator: false))
    }

    return next
  }
}

private struct UpcomingPaymentMerchantMark: View {
  let model: UpcomingPaymentSheetModel
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle().fill(backgroundColor)
      if let url = logoURL {
        logoImage(url: url)
      } else {
        fallback
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .accessibilityHidden(true)
  }

  @ViewBuilder
  private func logoImage(url: URL) -> some View {
    if url.isFileURL, let image = localImage(url: url) {
      fittedLogo(image)
    } else {
      AsyncImage(url: url) { phase in
        switch phase {
        case .success(let image):
          fittedLogo(image)
        default:
          fallback
        }
      }
    }
  }

  private func localImage(url: URL) -> Image? {
    guard let uiImage = NativeSheetLogoImage.image(fromLocalURL: url) else {
      return nil
    }
    return Image(uiImage: uiImage)
  }

  private func fittedLogo(_ image: Image) -> some View {
    image
      .resizable()
      .scaledToFit()
      .padding(size * 0.16)
  }

  private var logoURL: URL? {
    Self.renderableURL(from: model.logoUrl)
  }

  private static func renderableURL(from value: String?) -> URL? {
    guard let rawValue = value?.trimmingCharacters(in: .whitespacesAndNewlines), !rawValue.isEmpty else {
      return nil
    }
    if rawValue.hasPrefix("/") {
      return URL(fileURLWithPath: rawValue)
    }
    if let url = URL(string: rawValue), url.scheme != nil {
      return url
    }
    if let encoded = rawValue.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed),
       let url = URL(string: encoded),
       url.scheme != nil {
      return url
    }
    return nil
  }

  private var backgroundColor: Color {
    logoURL == nil
      ? model.color(.iconBgColor)
      : (model.logoBgColor.flatMap(Color.init(hexString:)) ?? Color.white.opacity(0.96))
  }

  private var fallback: some View {
    Image(systemName: model.fallbackSystemName)
      .font(.system(size: size * 0.46, weight: .regular))
      .foregroundStyle(model.color(.iconColor))
  }
}

private extension UpcomingPaymentSheetModel {
  enum ColorKey {
    case surface
    case sheetBg
    case chipBg
    case text
    case textSec
    case textTer
    case sep
    case accent
    case iconColor
    case iconBgColor
  }

  func color(_ key: ColorKey) -> Color {
    let raw: String
    switch key {
    case .surface: raw = surface
    case .sheetBg: raw = sheetBg
    case .chipBg: raw = chipBg
    case .text: raw = text
    case .textSec: raw = textSec
    case .textTer: raw = textTer
    case .sep: raw = sep
    case .accent: raw = accent
    case .iconColor: raw = iconColor
    case .iconBgColor: raw = iconBgColor
    }
    return Color(hexString: raw) ?? .primary
  }
}

private extension Color {
  init?(hexString: String) {
    let raw = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.hasPrefix("rgba(") || raw.hasPrefix("rgb(") {
      let body = raw
        .replacingOccurrences(of: "rgba(", with: "")
        .replacingOccurrences(of: "rgb(", with: "")
        .replacingOccurrences(of: ")", with: "")
      let parts = body.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
      guard parts.count >= 3 else {
        return nil
      }
      let alpha = parts.count >= 4 ? max(0, min(1, parts[3])) : 1
      self.init(
        red: max(0, min(255, parts[0])) / 255,
        green: max(0, min(255, parts[1])) / 255,
        blue: max(0, min(255, parts[2])) / 255,
        opacity: alpha
      )
      return
    }

    var hex = raw
    if hex.hasPrefix("#") {
      hex.removeFirst()
    }
    if hex.count == 8 {
      hex = String(hex.dropFirst(2))
    }
    guard hex.count == 6, let value = Int(hex, radix: 16) else {
      return nil
    }
    let red = Double((value >> 16) & 0xff) / 255
    let green = Double((value >> 8) & 0xff) / 255
    let blue = Double(value & 0xff) / 255
    self.init(red: red, green: green, blue: blue)
  }
}
