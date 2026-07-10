import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeBudgetCategorySheetViewProps: UIBaseViewProps {
  @Field var presentationToken: Int = 0
  @Field var isPresented: Bool = false
  @Field var payloadJson: String = ""
  @Field var isDark: Bool = false
  var onSubmit = EventDispatcher()
  var onDelete = EventDispatcher()
  var onDismiss = EventDispatcher()
}

public struct NativeBudgetCategorySheetView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeBudgetCategorySheetViewProps

  public init(props: NativeBudgetCategorySheetViewProps) {
    self.props = props
  }

  public var body: some View {
    NativeBudgetCategorySheetPresenter(
      presentationToken: props.presentationToken,
      isPresented: props.isPresented,
      payloadJson: props.payloadJson,
      isDark: props.isDark,
      onSubmit: { draft in props.onSubmit(draft.eventPayload) },
      onDelete: { props.onDelete([:]) },
      onDismiss: { props.onDismiss([:]) }
    )
  }
}

private struct BudgetCategoryIconOption: Decodable, Equatable, Identifiable {
  let id: String
  let label: String
  let systemName: String
}

private struct BudgetCategorySheetModel: Decodable, Equatable {
  let mode: String
  let title: String
  let label: String
  let icon: String
  let group: String
  let budget: String
  let goalTarget: String
  let goalSaved: String
  let goalDeadline: String
  let notes: String
  let canEdit: Bool
  let lockedCopy: String?
  let nameError: Bool
  let formError: String
  let currencySymbol: String
  let iconOptions: [BudgetCategoryIconOption]
  let surface: String
  let sheetBg: String
  let chipBg: String
  let text: String
  let textSec: String
  let textTer: String
  let sep: String
  let hairline: String
  let accent: String
  let accentInk: String
  let over: String
  let needsColor: String
  let wantsColor: String
  let savingsColor: String
}

private struct BudgetCategorySheetDraft {
  var label: String
  var icon: String
  var group: String
  var budget: String
  var goalTarget: String
  var goalSaved: String
  var goalDeadline: String
  var notes: String

  var eventPayload: [String: Any] {
    [
      "label": label,
      "icon": icon,
      "group": group,
      "budget": budget,
      "goalTarget": goalTarget,
      "goalSaved": goalSaved,
      "goalDeadline": goalDeadline,
      "notes": notes,
    ]
  }
}

private enum BudgetCategoryAmountField: Equatable {
  case budget
  case goalTarget
  case goalSaved
}

private struct NativeBudgetCategorySheetPresenter: View {
  let presentationToken: Int
  let isPresented: Bool
  let payloadJson: String
  let isDark: Bool
  let onSubmit: (BudgetCategorySheetDraft) -> Void
  let onDelete: () -> Void
  let onDismiss: () -> Void

  @State private var lastPresentationToken = 0
  @State private var showSheet = false
  @State private var model: BudgetCategorySheetModel?

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
      .onChange(of: isPresented) { nextValue in
        if !nextValue {
          showSheet = false
        } else {
          presentIfNeeded(presentationToken)
        }
      }
      .onChange(of: payloadJson) { newValue in
        guard let nextModel = decodeModel(newValue) else { return }
        model = nextModel
        presentIfNeeded(presentationToken, using: nextModel)
      }
      .sheet(isPresented: $showSheet) {
        if let model {
          if #available(iOS 26.0, *) {
            let animation: Animation = .snappy(duration: 0.3, extraBounce: 0)
            DynamicSheet(animation: animation) {
              BudgetCategorySheetContent(
                model: model,
                isDark: isDark,
                onSubmit: onSubmit,
                onDelete: onDelete
              )
            }
            .presentationDragIndicator(.visible)
          } else {
            BudgetCategorySheetContent(
              model: model,
              isDark: isDark,
              onSubmit: onSubmit,
              onDelete: onDelete
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
          }
        }
      }
      .onChange(of: showSheet) { visible in
        if !visible {
          onDismiss()
        }
      }
  }

  private func presentIfNeeded(_ token: Int) {
    guard isPresented, token > 0, token != lastPresentationToken else { return }
    guard let nextModel = decodeModel(payloadJson) else { return }
    presentIfNeeded(token, using: nextModel)
  }

  private func presentIfNeeded(_ token: Int, using nextModel: BudgetCategorySheetModel) {
    guard isPresented, token > 0, token != lastPresentationToken else { return }
    lastPresentationToken = token
    model = nextModel
    showSheet = true
  }

  private func decodeModel(_ json: String) -> BudgetCategorySheetModel? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(BudgetCategorySheetModel.self, from: data)
  }
}

private struct BudgetCategorySheetContent: View {
  let model: BudgetCategorySheetModel
  let isDark: Bool
  let onSubmit: (BudgetCategorySheetDraft) -> Void
  let onDelete: () -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var label: String
  @State private var icon: String
  @State private var group: String
  @State private var budget: String
  @State private var goalTarget: String
  @State private var goalSaved: String
  @State private var goalDeadline: Date?
  @State private var notes: String
  @State private var iconManuallySet = false
  @State private var activeAmountField: BudgetCategoryAmountField?
  @State private var amountValue = KeyPadValue()

  init(
    model: BudgetCategorySheetModel,
    isDark: Bool,
    onSubmit: @escaping (BudgetCategorySheetDraft) -> Void,
    onDelete: @escaping () -> Void
  ) {
    self.model = model
    self.isDark = isDark
    self.onSubmit = onSubmit
    self.onDelete = onDelete
    _label = State(initialValue: model.label)
    _icon = State(initialValue: model.icon)
    _group = State(initialValue: model.group)
    _budget = State(initialValue: model.budget)
    _goalTarget = State(initialValue: model.goalTarget)
    _goalSaved = State(initialValue: model.goalSaved)
    _goalDeadline = State(initialValue: Self.date(from: model.goalDeadline))
    _notes = State(initialValue: model.notes)
  }

  var body: some View {
    ZStack(alignment: .topLeading) {
      Color.clear
        .ignoresSafeArea()

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

      VStack(spacing: 20) {
        hero

        groupPicker

        fieldCard

        if showError {
          Text(validationError)
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(model.color(.over))
            .frame(maxWidth: .infinity, alignment: .leading)
            .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .top)))
        }

        if group == "savings" {
          savingsGoalSection
            .transition(.opacity.combined(with: .scale(scale: 0.985, anchor: .top)))
        }

        actionArea
      }
      .padding([.horizontal, .top], 20)
      .padding(.bottom, 22)
      .frame(maxWidth: .infinity)
      .frame(maxHeight: .infinity, alignment: .bottom)
      .geometryGroup()

      if model.canEdit {
        keypadOverlay
          .offset(y: activeAmountField == nil ? 360 : 0)
          .allowsHitTesting(activeAmountField != nil)
          .accessibilityHidden(activeAmountField == nil)
          .animation(.snappy(duration: 0.24, extraBounce: 0), value: activeAmountField != nil)
          .zIndex(4)
      }
    }
    .animation(.snappy(duration: 0.28, extraBounce: 0), value: group)
    .animation(.snappy(duration: 0.24, extraBounce: 0), value: validationError)
    .animation(.snappy(duration: 0.28, extraBounce: 0), value: activeAmountField != nil)
    .preferredColorScheme(isDark ? .dark : .light)
  }

  private var hero: some View {
    VStack(spacing: 0) {
      Menu {
        ForEach(model.iconOptions) { option in
          Button {
            guard model.canEdit else { return }
            iconManuallySet = true
            icon = option.id
          } label: {
            Label(option.label, systemImage: option.id == icon ? "checkmark" : option.systemName)
          }
        }
      } label: {
        ZStack(alignment: .bottomTrailing) {
          ZStack {
            Circle().fill(groupColor)
            Image(systemName: systemName(for: icon))
              .font(.system(size: 22, weight: .regular))
              .foregroundStyle(Color.white)
          }
          .frame(width: 52, height: 52)

          Circle()
            .fill(model.color(.surface))
            .stroke(model.color(.hairline), lineWidth: 0.5)
            .frame(width: 18, height: 18)
            .overlay {
              Image(systemName: "chevron.down")
                .font(.system(size: 7, weight: .bold))
                .foregroundStyle(model.color(.textSec))
            }
            .offset(x: 1, y: 1)
        }
      }
      .buttonStyle(.plain)
      .disabled(!model.canEdit)
      .opacity(model.canEdit ? 1 : 0.58)
      .accessibilityLabel("Choose category icon")

      Text(label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? model.title : label)
        .font(.title2)
        .fontWeight(.semibold)
        .foregroundStyle(model.color(.text))
        .lineLimit(1)
        .minimumScaleFactor(0.78)
        .multilineTextAlignment(.center)
        .padding(.top, 8)
    }
    .frame(maxWidth: .infinity)
  }

  private var groupPicker: some View {
    Picker("Budget group", selection: Binding(
      get: { group },
      set: { nextGroup in
        withAnimation(.snappy(duration: 0.28, extraBounce: 0)) {
          commitActiveAmount()
          activeAmountField = nil
          group = nextGroup
        }
      }
    )) {
      Text("Needs").tag("needs")
      Text("Wants").tag("wants")
      Text("Savings").tag("savings")
    }
    .pickerStyle(.segmented)
    .disabled(!model.canEdit)
    .tint(model.color(.accent))
  }

  private var fieldCard: some View {
    VStack(spacing: 0) {
      formRow(title: "Name") {
        TextField("Category name", text: $label)
          .multilineTextAlignment(.trailing)
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(model.color(.text))
          .disabled(!model.canEdit)
          .onTapGesture {
            closeKeypad()
          }
          .onChange(of: label) { nextValue in
            guard !iconManuallySet else { return }
            icon = Self.inferredIcon(for: nextValue)
          }
      }

      divider

      formRow(title: "Monthly budget") {
        amountField(.budget, text: $budget, placeholder: "0")
      }

      divider

      formRow(title: "Notes") {
        TextField("", text: $notes)
          .multilineTextAlignment(.trailing)
          .font(.system(size: 15, weight: .medium))
          .foregroundStyle(model.color(.text))
          .disabled(!model.canEdit)
          .onTapGesture {
            closeKeypad()
          }
      }
    }
    .padding(.horizontal, 16)
    .background(model.color(.chipBg), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .opacity(model.canEdit ? 1 : 0.58)
  }

  private var savingsGoalSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Savings Goal")
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(model.color(.text))

      VStack(spacing: 0) {
        formRow(title: "Goal amount") {
          amountField(.goalTarget, text: $goalTarget, placeholder: "Optional")
        }

        divider

        formRow(title: "Saved so far") {
          amountField(.goalSaved, text: $goalSaved, placeholder: "Optional")
        }

        divider

        formRow(title: "Goal by") {
          if goalDeadline != nil {
            let deadline = Binding<Date>(
              get: { goalDeadline ?? Date() },
              set: { goalDeadline = $0 }
            )
            HStack(spacing: 8) {
              DatePicker("", selection: deadline, displayedComponents: .date)
                .labelsHidden()
                .tint(model.color(.accent))
                .disabled(!model.canEdit)
            Button {
              closeKeypad()
              withAnimation(.snappy(duration: 0.24, extraBounce: 0)) {
                goalDeadline = nil
              }
            } label: {
                Image(systemName: "xmark")
                  .font(.system(size: 11, weight: .semibold))
                  .foregroundStyle(model.color(.textTer))
              }
              .buttonStyle(.plain)
              .disabled(!model.canEdit)
            }
          } else {
            Button {
              closeKeypad()
              var components = DateComponents()
              components.year = 1
              withAnimation(.snappy(duration: 0.24, extraBounce: 0)) {
                goalDeadline = Calendar.current.date(byAdding: components, to: Date()) ?? Date()
              }
            } label: {
              Text("Set date")
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(model.color(.accent))
            }
            .buttonStyle(.plain)
            .disabled(!model.canEdit)
          }
        }
      }
      .padding(.horizontal, 16)
      .background(model.color(.chipBg), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .opacity(model.canEdit ? 1 : 0.58)

      if parsedGoalTarget > 0 {
        VStack(alignment: .leading, spacing: 8) {
          GeometryReader { proxy in
            ZStack(alignment: .leading) {
              Capsule().fill(model.color(.hairline))
              Capsule()
                .fill(model.color(.savingsColor))
                .frame(width: proxy.size.width * max(0, min(1, goalProgress)))
            }
          }
          .frame(height: 6)

          Text("\(Int((goalProgress * 100).rounded()))% · \(model.currencySymbol)\(Self.formattedAmount(max(0, parsedGoalTarget - parsedGoalSaved))) to go")
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(model.color(.textSec))
        }
        .padding(.top, 6)
      }
    }
  }

  private var actionArea: some View {
    VStack(spacing: 10) {
      Button {
        guard model.canEdit, validationError.isEmpty else { return }
        commitActiveAmount()
        onSubmit(
          BudgetCategorySheetDraft(
            label: label.trimmingCharacters(in: .whitespacesAndNewlines),
            icon: icon,
            group: group,
            budget: budget,
            goalTarget: goalTarget,
            goalSaved: goalSaved,
            goalDeadline: Self.isoDate(goalDeadline),
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines)
          )
        )
      } label: {
        Text(model.mode == "add" ? "Add category" : "Save category")
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(model.color(.accentInk))
          .frame(maxWidth: .infinity)
          .frame(height: 52)
          .background(saveEnabled ? model.color(.accent) : model.color(.textTer), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(!saveEnabled)
      .opacity(saveEnabled ? 1 : 0.58)

      if model.mode != "add" && model.canEdit {
        Button(role: .destructive) {
          onDelete()
          dismiss()
        } label: {
          Text("Delete category")
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(model.color(.over))
            .frame(maxWidth: .infinity)
            .frame(height: 42)
        }
        .buttonStyle(.plain)
      } else if !model.canEdit {
        Text(model.lockedCopy ?? "This category is locked by its owner.")
          .font(.system(size: 12, weight: .regular))
          .foregroundStyle(model.color(.textSec))
          .multilineTextAlignment(.center)
          .padding(.top, 2)
      }
    }
  }

  private func formRow<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
    HStack(spacing: 12) {
      Text(title)
        .font(.system(size: 15, weight: .regular))
        .foregroundStyle(model.color(.textSec))
        .fixedSize()
      Spacer(minLength: 16)
      content()
    }
    .frame(height: 54)
    .contentShape(Rectangle())
  }

  private func amountField(_ field: BudgetCategoryAmountField, text: Binding<String>, placeholder: String) -> some View {
    Button {
      guard model.canEdit else { return }
      if activeAmountField == field {
        closeKeypad()
      } else {
        activateAmountField(field, currentValue: text.wrappedValue)
      }
    } label: {
      HStack(spacing: 0) {
        if activeAmountField == field {
          Text(model.currencySymbol)
            .foregroundStyle(model.color(.textSec))
          BudgetAnimatedCentsTextView(value: $amountValue)
            .foregroundStyle(model.color(.text))
        } else if text.wrappedValue.isEmpty {
          Text(placeholder == "0" ? "\(model.currencySymbol)0" : placeholder)
            .foregroundStyle(model.color(.textTer))
        } else {
          Text(model.currencySymbol)
            .foregroundStyle(model.color(.textSec))
          Text(Self.formattedAmount(Self.amount(from: text.wrappedValue) ?? 0))
            .foregroundStyle(model.color(.text))
        }
      }
      .font(.system(size: 15, weight: .medium))
      .monospacedDigit()
      .contentTransition(.numericText())
      .frame(maxWidth: 148, alignment: .trailing)
    }
    .buttonStyle(.plain)
    .disabled(!model.canEdit)
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
        keypadButton {
          Text("\(number)")
        } action: {
          amountValue.append(number)
          commitActiveAmount()
        }
      }

      keypadButton {
        Text("00")
      } action: {
        amountValue.append(0)
        amountValue.append(0)
        commitActiveAmount()
      }

      ForEach(["0", "delete.backward.fill"], id: \.self) { key in
        keypadButton(repeats: key != "0") {
          Group {
            if key == "0" {
              Text("0")
            } else {
              Image(systemName: key)
            }
          }
        } action: {
          if key == "0" {
            amountValue.append(0)
          } else {
            amountValue.removeLast()
          }
          commitActiveAmount()
        }
      }
    }
    .buttonStyle(KeypadButtonStyle())
    .geometryGroup()
  }

  private func keypadButton<Content: View>(
    repeats: Bool = false,
    @ViewBuilder label: () -> Content,
    action: @escaping () -> Void
  ) -> some View {
    Button {
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
      withAnimation(.easeInOut(duration: 0.25)) {
        action()
      }
    } label: {
      label()
        .font(.title2.bold())
        .foregroundStyle(model.color(.text))
        .frame(maxWidth: .infinity)
        .frame(height: 62)
        .contentShape(Rectangle())
    }
    .buttonRepeatBehavior(repeats ? .enabled : .disabled)
  }

  private var divider: some View {
    Rectangle()
      .fill(model.color(.sep))
      .frame(height: 0.5)
  }

  private var groupColor: Color {
    switch group {
    case "needs": return model.color(.needsColor)
    case "savings": return model.color(.savingsColor)
    default: return model.color(.wantsColor)
    }
  }

  private var parsedBudget: Double? {
    Self.amount(from: budget)
  }

  private var parsedGoalTarget: Double {
    Self.amount(from: goalTarget) ?? 0
  }

  private var parsedGoalSaved: Double {
    Self.amount(from: goalSaved) ?? 0
  }

  private var goalProgress: Double {
    parsedGoalTarget > 0 ? min(1, parsedGoalSaved / parsedGoalTarget) : 0
  }

  private var validationError: String {
    if label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return "Category name is required"
    }
    if !budget.isEmpty && parsedBudget == nil {
      return "Enter a valid monthly budget"
    }
    if group == "savings" {
      if !goalTarget.isEmpty && Self.amount(from: goalTarget) == nil {
        return "Enter a valid savings target"
      }
      if !goalSaved.isEmpty && Self.amount(from: goalSaved) == nil {
        return "Enter a valid saved amount"
      }
      if parsedGoalSaved > 0 && parsedGoalTarget <= 0 {
        return "Add a target before entering saved so far"
      }
      if parsedGoalTarget > 0 && parsedGoalSaved > parsedGoalTarget {
        return "Saved amount cannot be greater than the target"
      }
    }
    if model.nameError {
      return "A category with this name already exists"
    }
    return model.formError
  }

  private var showError: Bool {
    !validationError.isEmpty && (!label.isEmpty || !budget.isEmpty || !goalTarget.isEmpty || !goalSaved.isEmpty || !model.formError.isEmpty || model.nameError)
  }

  private var saveEnabled: Bool {
    model.canEdit && validationError.isEmpty
  }

  private func activateAmountField(_ field: BudgetCategoryAmountField, currentValue: String) {
    commitActiveAmount()
    withAnimation(.snappy(duration: 0.28, extraBounce: 0)) {
      activeAmountField = field
      amountValue = KeyPadValue(stringValue: Self.centsDigits(from: currentValue))
    }
  }

  private func closeKeypad() {
    guard activeAmountField != nil else { return }
    commitActiveAmount()
    withAnimation(.snappy(duration: 0.24, extraBounce: 0)) {
      activeAmountField = nil
    }
  }

  private func commitActiveAmount() {
    guard let activeAmountField else { return }
    let nextValue = Self.amountString(fromCentsDigits: amountValue.stringValue)
    switch activeAmountField {
    case .budget:
      budget = nextValue
    case .goalTarget:
      goalTarget = nextValue
    case .goalSaved:
      goalSaved = nextValue
    }
  }

  private func systemName(for id: String) -> String {
    model.iconOptions.first(where: { $0.id == id })?.systemName ?? "tag"
  }

  private static func sanitizedAmount(_ rawValue: String) -> String {
    var output = ""
    var hasDecimal = false
    var decimalCount = 0
    for char in rawValue {
      if char.isNumber {
        if hasDecimal {
          guard decimalCount < 2 else { continue }
          decimalCount += 1
        }
        output.append(char)
      } else if char == ".", !hasDecimal {
        hasDecimal = true
        output.append(char)
      }
    }
    return output
  }

  private static func amount(from rawValue: String) -> Double? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed != "." else { return nil }
    guard let value = Double(trimmed), value >= 0 else { return nil }
    return value
  }

  private static func centsDigits(from rawValue: String) -> String {
    let clean = rawValue.filter { "0123456789.".contains($0) }
    guard let amount = Double(clean), amount > 0 else {
      return ""
    }
    return String(Int((amount * 100).rounded()))
  }

  private static func amountString(fromCentsDigits digits: String) -> String {
    guard let cents = Int(digits), cents > 0 else {
      return ""
    }
    if cents.isMultiple(of: 100) {
      return String(cents / 100)
    }
    return String(format: "%.2f", Double(cents) / 100)
  }

  private static func formattedAmount(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = value.rounded() == value ? 0 : 2
    formatter.minimumFractionDigits = 0
    return formatter.string(from: NSNumber(value: value)) ?? "\(Int(value.rounded()))"
  }

  private static func date(from iso: String) -> Date? {
    guard !iso.isEmpty else { return nil }
    let formatter = ISO8601DateFormatter()
    if let date = formatter.date(from: iso) {
      return date
    }
    let short = DateFormatter()
    short.dateFormat = "yyyy-MM-dd"
    short.timeZone = TimeZone(secondsFromGMT: 0)
    return short.date(from: iso)
  }

  private static func isoDate(_ date: Date?) -> String {
    guard let date else { return "" }
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }

  private static func inferredIcon(for value: String) -> String {
    let lower = value.lowercased()
    if lower.contains("grocery") || lower.contains("market") || lower.contains("food") {
      return "cart"
    }
    if lower.contains("dining") || lower.contains("restaurant") || lower.contains("coffee") {
      return "fork"
    }
    if lower.contains("transport") || lower.contains("gas") || lower.contains("car") {
      return "car"
    }
    if lower.contains("shop") || lower.contains("clothes") {
      return "bag"
    }
    if lower.contains("bill") || lower.contains("utility") {
      return "doc"
    }
    if lower.contains("movie") || lower.contains("entertainment") {
      return "film"
    }
    if lower.contains("home") || lower.contains("rent") || lower.contains("housing") {
      return "home"
    }
    if lower.contains("saving") || lower.contains("wallet") || lower.contains("fund") {
      return "wallet"
    }
    return "tag"
  }
}

private struct BudgetAnimatedCentsTextView: View {
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

private extension BudgetCategorySheetModel {
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
    case accentInk
    case over
    case needsColor
    case wantsColor
    case savingsColor
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
    case .accentInk: raw = accentInk
    case .over: raw = over
    case .needsColor: raw = needsColor
    case .wantsColor: raw = wantsColor
    case .savingsColor: raw = savingsColor
    }
    return Color(budgetCategoryHexString: raw) ?? .primary
  }
}

private extension Color {
  init?(budgetCategoryHexString: String) {
    let raw = budgetCategoryHexString.trimmingCharacters(in: .whitespacesAndNewlines)
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
    guard hex.count == 6, let value = Int(hex, radix: 16) else { return nil }
    let red = Double((value >> 16) & 0xff) / 255
    let green = Double((value >> 8) & 0xff) / 255
    let blue = Double(value & 0xff) / 255
    self.init(red: red, green: green, blue: blue)
  }
}
