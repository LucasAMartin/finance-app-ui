import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeTransactionSheetViewProps: UIBaseViewProps {
  @Field var presentationToken: Int = 0
  @Field var payloadJson: String = ""
  @Field var isDark: Bool = false
  var onSave = EventDispatcher()
  var onDelete = EventDispatcher()
  var onDismiss = EventDispatcher()
}

public struct NativeTransactionSheetView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeTransactionSheetViewProps

  public init(props: NativeTransactionSheetViewProps) {
    self.props = props
  }

  public var body: some View {
    NativeTransactionSheetPresenter(
      presentationToken: props.presentationToken,
      payloadJson: props.payloadJson,
      isDark: props.isDark,
      onSave: { payload in props.onSave(payload) },
      onDelete: { id in props.onDelete(["id": id]) },
      onDismiss: { props.onDismiss([:]) }
    )
  }
}

private struct TransactionSheetCategory: Decodable, Equatable, Identifiable {
  let id: String
  let label: String
  let group: String
}

private struct TransactionSheetModel: Decodable, Equatable {
  let id: String
  let title: String
  let merchant: String
  let note: String
  let amount: Double
  let amountDraft: String
  let occurredAtISO: String
  let metaLine: String
  let canEdit: Bool
  let lockedOwnerName: String?
  let currencySymbol: String
  let categoryId: String
  let categoryLabel: String
  let categorySpendText: String
  let categoryBudgetText: String
  let categoryProgress: Double
  let categoryColor: String
  let fallbackSystemName: String
  let iconColor: String
  let iconBgColor: String
  let logoUrl: String?
  let logoBgColor: String?
  let categories: [TransactionSheetCategory]
  let surface: String
  let sheetBg: String
  let chipBg: String
  let text: String
  let textSec: String
  let textTer: String
  let sep: String
  let hairline: String
  let accent: String
}

private struct NativeTransactionSheetPresenter: View {
  let presentationToken: Int
  let payloadJson: String
  let isDark: Bool
  let onSave: ([String: Any]) -> Void
  let onDelete: (String) -> Void
  let onDismiss: () -> Void

  @State private var lastPresentationToken: Int = 0
  @State private var showSheet = false
  @State private var model: TransactionSheetModel?
  @State private var selectedDetent: PresentationDetent = .fraction(0.48)

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
        guard let nextModel = decodeModel(newValue) else { return }
        model = nextModel
      }
      .sheet(isPresented: $showSheet) {
        if let model {
          TransactionSheetContent(
            model: model,
            isDark: isDark,
            selectedDetent: $selectedDetent,
            onSave: onSave,
            onDelete: onDelete
          )
          .presentationDetents([.fraction(0.48), .large], selection: $selectedDetent)
          .presentationDragIndicator(.visible)
        }
      }
      .onChange(of: showSheet) { isPresented in
        if !isPresented {
          onDismiss()
        }
      }
  }

  private func presentIfNeeded(_ token: Int) {
    guard token > 0, token != lastPresentationToken else { return }
    guard let nextModel = decodeModel(payloadJson) else { return }
    lastPresentationToken = token
    model = nextModel
    selectedDetent = .fraction(0.48)
    showSheet = true
  }

  private func decodeModel(_ json: String) -> TransactionSheetModel? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(TransactionSheetModel.self, from: data)
  }
}

private struct TransactionSheetContent: View {
  let model: TransactionSheetModel
  let isDark: Bool
  @Binding var selectedDetent: PresentationDetent
  let onSave: ([String: Any]) -> Void
  let onDelete: (String) -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var mode: TransactionSheetMode = .compact
  @State private var amountValue: KeyPadValue
  @State private var merchant: String
  @State private var note: String
  @State private var occurredAt: Date
  @State private var selectedCategoryId: String
  @State private var selectedGroup: String
  @State private var showKeypad = false
  @State private var showDatePicker = false

  init(
    model: TransactionSheetModel,
    isDark: Bool,
    selectedDetent: Binding<PresentationDetent>,
    onSave: @escaping ([String: Any]) -> Void,
    onDelete: @escaping (String) -> Void
  ) {
    self.model = model
    self.isDark = isDark
    _selectedDetent = selectedDetent
    self.onSave = onSave
    self.onDelete = onDelete
    _amountValue = State(initialValue: KeyPadValue(stringValue: Self.centsDigits(from: model.amountDraft)))
    _merchant = State(initialValue: model.merchant)
    _note = State(initialValue: model.note)
    _occurredAt = State(initialValue: Self.date(from: model.occurredAtISO))
    _selectedCategoryId = State(initialValue: model.categoryId)
    _selectedGroup = State(initialValue: model.categories.first(where: { $0.id == model.categoryId })?.group ?? "wants")
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
        if mode == .compact {
          hero(size: 52, titleSize: 17, metaSize: 13, amountSize: 32, titleTop: 12, metaTop: 5, amountTop: 18, bottom: 20)
            .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .top)))
        } else {
          hero(size: 42, titleSize: 20, metaSize: 12, amountSize: 28, titleTop: 9, metaTop: 3, amountTop: 12, bottom: 12)
            .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .top)))
        }

        if mode == .compact {
          compactSummary
            .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .top)))
        } else {
          editForm
            .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .top)))
        }
      }
      .padding(.top, 32)
      .padding(.horizontal, 20)
      .padding(.bottom, 24)
      .frame(maxWidth: .infinity)

      if mode == .edit && model.canEdit {
        keypadOverlay
          .offset(y: showKeypad ? 0 : 360)
          .allowsHitTesting(showKeypad)
          .accessibilityHidden(!showKeypad)
          .animation(.snappy(duration: 0.24, extraBounce: 0), value: showKeypad)
          .zIndex(4)
      }
    }
    .preferredColorScheme(isDark ? .dark : .light)
    .onChange(of: selectedDetent) { newValue in
      withAnimation(.snappy(duration: 0.24, extraBounce: 0)) {
        if newValue == .large {
          mode = .edit
        } else {
          mode = .compact
          showKeypad = false
          showDatePicker = false
        }
      }
    }
    .onChange(of: selectedGroup) { newValue in
      guard !categories(for: newValue).contains(where: { $0.id == selectedCategoryId }) else {
        return
      }
      if let first = categories(for: newValue).first {
        selectedCategoryId = first.id
      }
    }
    .onChange(of: model.id) { _ in
      resetDrafts(from: model)
    }
  }

  private func hero(
    size: CGFloat,
    titleSize: CGFloat,
    metaSize: CGFloat,
    amountSize: CGFloat,
    titleTop: CGFloat,
    metaTop: CGFloat,
    amountTop: CGFloat,
    bottom: CGFloat
  ) -> some View {
    VStack(spacing: 0) {
      TransactionSheetMerchantMark(model: model, size: size)
      Text(model.title)
        .font(.system(size: titleSize, weight: .semibold))
        .foregroundStyle(model.color(.text))
        .multilineTextAlignment(.center)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .padding(.top, titleTop)

      Text(model.metaLine)
        .font(.system(size: metaSize))
        .foregroundStyle(model.color(.textSec))
        .multilineTextAlignment(.center)
        .lineLimit(2)
        .padding(.top, metaTop)

      HStack(spacing: 1) {
        Text("-")
        Text(model.currencySymbol)
          .foregroundStyle(model.color(.textSec))
        TxAnimatedCentsTextView(value: $amountValue)
      }
      .font(.system(size: amountSize, weight: .semibold))
      .foregroundStyle(model.color(.text))
      .monospacedDigit()
      .padding(.top, amountTop)
    }
    .frame(maxWidth: .infinity)
    .padding(.top, 12)
    .padding(.bottom, bottom)
  }

  private var compactSummary: some View {
    VStack(spacing: 0) {
      if !model.note.isEmpty {
        HStack(spacing: 12) {
          Text("Note")
            .font(.system(size: 13))
            .foregroundStyle(model.color(.textSec))
          Spacer(minLength: 12)
          Text(model.note)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(model.color(.text))
            .lineLimit(2)
            .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(model.color(.chipBg), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.bottom, 16)
      }

      VStack(spacing: 9) {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
          Text("\(model.categoryLabel) this month")
            .font(.system(size: 13))
            .foregroundStyle(model.color(.textSec))
            .lineLimit(1)
          Spacer(minLength: 8)
          HStack(spacing: 3) {
            Text(model.categorySpendText)
              .font(.system(size: 13, weight: .semibold))
              .foregroundStyle(model.color(.text))
            Text("of \(model.categoryBudgetText)")
              .font(.system(size: 13))
              .foregroundStyle(model.color(.textSec))
          }
        }

        GeometryReader { proxy in
          ZStack(alignment: .leading) {
            Capsule().fill(model.color(.hairline))
            Capsule()
              .fill(model.color(.categoryColor))
              .frame(width: proxy.size.width * max(0, min(1, model.categoryProgress)))
          }
        }
        .frame(height: 4)
      }
      .padding(.bottom, 16)

      if model.canEdit {
        Button {
          UIImpactFeedbackGenerator(style: .light).impactOccurred()
          withAnimation(.snappy(duration: 0.28, extraBounce: 0)) {
            selectedDetent = .large
            mode = .edit
          }
        } label: {
          HStack(spacing: 8) {
            Image(systemName: "chevron.up")
              .font(.system(size: 12, weight: .semibold))
            Text("Edit")
              .font(.system(size: 12, weight: .semibold))
          }
          .foregroundStyle(model.color(.textSec))
          .frame(maxWidth: .infinity)
          .frame(height: 44)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      } else {
        lockedCopy
      }
    }
  }

  private var editForm: some View {
    VStack(spacing: 0) {
      fieldCard

      categoryPanel
        .padding(.top, 20)

      Button {
        save()
      } label: {
        Text("Save changes")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity)
          .frame(height: 52)
          .background(model.canEdit ? model.color(.accent) : model.color(.textTer), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(!model.canEdit)
      .opacity(model.canEdit ? 1 : 0.58)
      .padding(.top, 28)

      if model.canEdit {
        Button(role: .destructive) {
          UIImpactFeedbackGenerator(style: .medium).impactOccurred()
          onDelete(model.id)
          dismiss()
        } label: {
          Text("Delete transaction")
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
        }
        .buttonStyle(.plain)
      } else {
        lockedCopy
      }
    }
  }

  private var fieldCard: some View {
    VStack(spacing: 0) {
      Button {
        guard model.canEdit else { return }
        hideKeyboard()
        withAnimation(.snappy(duration: 0.24, extraBounce: 0)) {
          showDatePicker = false
          showKeypad.toggle()
        }
      } label: {
        fieldRow(label: "Amount") {
          HStack(spacing: 0) {
            Text(model.currencySymbol)
              .foregroundStyle(model.color(.textSec))
            TxAnimatedCentsTextView(value: $amountValue)
              .foregroundStyle(model.color(.text))
          }
          .font(.system(size: 17, weight: .semibold))
          .monospacedDigit()
        }
      }
      .buttonStyle(.plain)
      .disabled(!model.canEdit)

      separator

      Button {
        guard model.canEdit else { return }
        hideKeyboard()
        withAnimation(.snappy(duration: 0.24, extraBounce: 0)) {
          showKeypad = false
          showDatePicker.toggle()
        }
      } label: {
        fieldRow(label: "Date & time") {
          Text(Self.formatDateTime(occurredAt))
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(model.color(.text))
            .lineLimit(1)
            .minimumScaleFactor(0.76)
        }
      }
      .buttonStyle(.plain)
      .disabled(!model.canEdit)

      if showDatePicker {
        separator
        DatePicker("", selection: $occurredAt, displayedComponents: [.date, .hourAndMinute])
          .datePickerStyle(.wheel)
          .labelsHidden()
          .tint(model.color(.accent))
          .frame(maxWidth: .infinity)
          .frame(height: 216)
          .clipped()
      }

      separator

      fieldRow(label: "Merchant") {
        TextField("Merchant name", text: $merchant)
          .disabled(!model.canEdit)
          .multilineTextAlignment(.trailing)
          .textInputAutocapitalization(.words)
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(model.color(.text))
          .onTapGesture {
            closeCustomPanels()
          }
      }

      separator

      fieldRow(label: "Note") {
        TextField("Optional", text: $note)
          .disabled(!model.canEdit)
          .multilineTextAlignment(.trailing)
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(model.color(.text))
          .onTapGesture {
            closeCustomPanels()
          }
      }
    }
    .padding(.horizontal, 16)
    .opacity(model.canEdit ? 1 : 0.58)
    .background(model.color(.chipBg), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
  }

  private var categoryPanel: some View {
    VStack(spacing: 0) {
      Picker("Group", selection: $selectedGroup) {
        Text("Needs").tag("needs")
        Text("Wants").tag("wants")
        Text("Savings").tag("savings")
      }
      .pickerStyle(.segmented)
      .disabled(!model.canEdit)
      .tint(model.color(.accent))
      .padding(.horizontal, 12)
      .padding(.top, 12)
      .padding(.bottom, 4)

      Rectangle()
        .fill(model.color(.hairline))
        .frame(height: 0.5)
        .padding(.top, 8)

      HStack(spacing: 12) {
        Text("Subcategory")
          .font(.system(size: 16))
          .foregroundStyle(model.color(.textSec))
        Spacer(minLength: 16)
        if categories(for: selectedGroup).isEmpty {
          Text("No subcategories")
            .font(.system(size: 13))
            .foregroundStyle(model.color(.textTer))
        } else {
          Menu {
            ForEach(categories(for: selectedGroup)) { category in
              Button {
                selectedCategoryId = category.id
              } label: {
                if category.id == selectedCategoryId {
                  Label(category.label, systemImage: "checkmark")
                } else {
                  Text(category.label)
                }
              }
            }
          } label: {
            HStack(spacing: 5) {
              Text(selectedCategoryLabel)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(model.color(.text))
                .lineLimit(1)
              Image(systemName: "chevron.down")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(model.color(.text))
            }
          }
          .disabled(!model.canEdit)
        }
      }
      .frame(height: 52)
      .padding(.horizontal, 12)
    }
    .simultaneousGesture(
      TapGesture().onEnded {
        closeTransientInputs()
      }
    )
    .opacity(model.canEdit ? 1 : 0.58)
    .background(model.color(.chipBg), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(model.color(.hairline), lineWidth: 1)
    )
  }

  private var keypadOverlay: some View {
    VStack {
      Color.clear
        .contentShape(Rectangle())
        .onTapGesture {
          closeTransientInputs()
        }
      VStack(spacing: 8) {
        HStack {
          Spacer()
          Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            withAnimation(.snappy(duration: 0.2, extraBounce: 0)) {
              showKeypad = false
            }
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
          .stroke(model.color(.hairline), lineWidth: 0.5)
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
        keypadButton(title: "\(number)") {
          amountValue.append(number)
        }
      }

      keypadButton(title: "00") {
        amountValue.append(0)
        amountValue.append(0)
      }

      keypadButton(title: "0") {
        amountValue.append(0)
      }

      Button {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        withAnimation(.easeInOut(duration: 0.25)) {
          amountValue.removeLast()
        }
      } label: {
        Image(systemName: "delete.backward.fill")
          .font(.title2.bold())
          .foregroundStyle(model.color(.text))
          .frame(maxWidth: .infinity)
          .frame(height: 62)
          .contentShape(Rectangle())
      }
      .buttonRepeatBehavior(.enabled)
    }
    .buttonStyle(KeypadButtonStyle())
  }

  private func keypadButton(title: String, action: @escaping () -> Void) -> some View {
    Button {
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
      withAnimation(.easeInOut(duration: 0.25)) {
        action()
      }
    } label: {
      Text(title)
        .font(.title2.bold())
        .foregroundStyle(model.color(.text))
        .frame(maxWidth: .infinity)
        .frame(height: 62)
        .contentShape(Rectangle())
    }
  }

  private var lockedCopy: some View {
    Text("\(model.lockedOwnerName ?? "This member") has locked edits for this transaction.")
      .font(.system(size: 12))
      .foregroundStyle(model.color(.textSec))
      .multilineTextAlignment(.center)
      .padding(.top, 12)
      .padding(.horizontal, 16)
  }

  private var separator: some View {
    Rectangle()
      .fill(model.color(.sep))
      .frame(height: 0.5)
  }

  private func fieldRow<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
    HStack(spacing: 12) {
      Text(label)
        .font(.system(size: 16))
        .foregroundStyle(model.color(.textSec))
        .fixedSize(horizontal: true, vertical: false)
      Spacer(minLength: 16)
      content()
    }
    .frame(height: 54)
    .contentShape(Rectangle())
  }

  private func save() {
    guard model.canEdit, let amount = Self.amount(fromCentsDigits: amountValue.stringValue), amount > 0 else {
      return
    }
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    onSave([
      "id": model.id,
      "amount": amount,
      "categoryId": selectedCategoryId,
      "merchant": merchant,
      "note": note,
      "occurredAtISO": Self.isoString(from: occurredAt),
    ])
    dismiss()
  }

  private var selectedCategoryLabel: String {
    model.categories.first(where: { $0.id == selectedCategoryId })?.label ?? model.categoryLabel
  }

  private func categories(for group: String) -> [TransactionSheetCategory] {
    model.categories.filter { $0.group == group }
  }

  private func resetDrafts(from model: TransactionSheetModel) {
    amountValue = KeyPadValue(stringValue: Self.centsDigits(from: model.amountDraft))
    merchant = model.merchant
    note = model.note
    occurredAt = Self.date(from: model.occurredAtISO)
    selectedCategoryId = model.categoryId
    selectedGroup = model.categories.first(where: { $0.id == model.categoryId })?.group ?? "wants"
    mode = .compact
    selectedDetent = .fraction(0.48)
    showKeypad = false
    showDatePicker = false
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

  private static func date(from iso: String) -> Date {
    if let date = ISO8601DateFormatter().date(from: iso) {
      return date
    }
    return Date()
  }

  private static func isoString(from date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }

  private static func formatDateTime(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.dateStyle = .medium
    formatter.timeStyle = .short
    return formatter.string(from: date)
  }

  private func hideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }

  private func closeTransientInputs() {
    hideKeyboard()
    closeCustomPanels()
  }

  private func closeCustomPanels() {
    withAnimation(.snappy(duration: 0.2, extraBounce: 0)) {
      showKeypad = false
      showDatePicker = false
    }
  }
}

private enum TransactionSheetMode {
  case compact
  case edit
}

private struct TxAnimatedCentsTextView: View {
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

private struct TransactionSheetMerchantMark: View {
  let model: TransactionSheetModel
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
    guard url.isFileURL, let uiImage = UIImage(contentsOfFile: url.path) else {
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
    guard let raw = model.logoUrl else { return nil }
    return URL(string: raw)
  }

  private var backgroundColor: Color {
    logoURL == nil
      ? model.color(.iconBgColor)
      : (model.logoBgColor.flatMap(Color.init(txSheetHexString:)) ?? Color.white.opacity(0.96))
  }

  private var fallback: some View {
    Image(systemName: model.fallbackSystemName)
      .font(.system(size: size * 0.46, weight: .regular))
      .foregroundStyle(model.color(.iconColor))
  }
}

private extension TransactionSheetModel {
  enum ColorKey {
    case surface
    case sheetBg
    case chipBg
    case text
    case textSec
    case textTer
    case sep
    case hairline
    case accent
    case categoryColor
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
    case .hairline: raw = hairline
    case .accent: raw = accent
    case .categoryColor: raw = categoryColor
    case .iconColor: raw = iconColor
    case .iconBgColor: raw = iconBgColor
    }
    return Color(txSheetHexString: raw) ?? .primary
  }
}

private extension Color {
  init?(txSheetHexString: String) {
    let raw = txSheetHexString.trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.hasPrefix("rgba(") || raw.hasPrefix("rgb(") {
      let body = raw
        .replacingOccurrences(of: "rgba(", with: "")
        .replacingOccurrences(of: "rgb(", with: "")
        .replacingOccurrences(of: ")", with: "")
      let parts = body.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
      guard parts.count >= 3 else { return nil }
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
