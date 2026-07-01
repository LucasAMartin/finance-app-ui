import AppIntents
import Foundation
import SQLite3
import UIKit

@available(iOS 16.0, *)
struct ImportApplePayTransactionIntent: AppIntent {
  static var title: LocalizedStringResource = "Import Apple Pay Transaction"
  static var description = IntentDescription("Send an Apple Pay transaction to finance-app.")
  static var openAppWhenRun = false

  @Parameter(title: "Transaction", inputConnectionBehavior: .connectToPreviousIntentResult)
  var transaction: String

  @Parameter(title: "Amount")
  var amount: Double?

  @Parameter(title: "Merchant")
  var merchant: String?

  @Parameter(title: "Date")
  var date: Date?

  static var parameterSummary: some ParameterSummary {
    Summary("Import \(\.$transaction) as Apple Pay transaction") {
      \.$amount
      \.$merchant
      \.$date
    }
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    guard let draft = ApplePayTransactionParser.makeDraft(
      transaction: transaction,
      amount: amount,
      merchant: merchant,
      date: date,
      source: .wallet
    ) else {
      return .result()
    }

    do {
      switch try ApplePayTransactionStore.importInBackground(draft) {
      case .saved, .duplicate, .disabled:
        return .result()
      case .needsReview:
        await openReview(for: draft)
        return .result()
      }
    } catch {
      ApplePayTransactionStore.recordFailure(draft, error: error)
      await openReview(for: draft)
      return .result()
    }
  }

  @MainActor
  private func openReview(for draft: ApplePayTransactionDraft) async {
    var components = URLComponents()
    components.scheme = "financeapp"
    components.host = ""
    components.path = "/expense"

    var queryItems = [
      URLQueryItem(name: "source", value: draft.source.rawValue),
      URLQueryItem(name: "autoSave", value: "1"),
    ]

    if let rawText = draft.rawText, !rawText.isEmpty {
      queryItems.append(URLQueryItem(name: "text", value: rawText))
    }

    queryItems.append(URLQueryItem(name: "amount", value: String(format: "%.2f", draft.amount)))
    queryItems.append(URLQueryItem(name: "merchant", value: draft.merchant))
    queryItems.append(URLQueryItem(name: "category", value: draft.category))
    queryItems.append(URLQueryItem(name: "date", value: ISO8601DateFormatter().string(from: draft.occurredAt)))

    components.queryItems = queryItems

    if let url = components.url {
      await UIApplication.shared.open(url)
    }
  }
}

@available(iOS 16.0, *)
struct ImportTextTransactionIntent: AppIntent {
  static var title: LocalizedStringResource = "Process Receipt"
  static var description = IntentDescription("Send a transaction alert or receipt text to finance-app.")
  static var openAppWhenRun = false

  @Parameter(title: "Receipt Text", inputConnectionBehavior: .connectToPreviousIntentResult)
  var message: String

  @Parameter(title: "Amount")
  var amount: Double?

  @Parameter(title: "Merchant")
  var merchant: String?

  @Parameter(title: "Date")
  var date: Date?

  static var parameterSummary: some ParameterSummary {
    Summary("Process receipt \(\.$message)") {
      \.$amount
      \.$merchant
      \.$date
    }
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    if let rejectionReason = ApplePayTransactionParser.rejectionReason(
      transaction: message,
      amount: amount,
      source: .sms
    ) {
      ApplePayTransactionStore.recordIgnored(
        source: .sms,
        rawText: message,
        amount: ApplePayTransactionParser.resolvedAmount(transaction: message, amount: amount),
        reason: rejectionReason
      )
      return .result()
    }

    guard let draft = ApplePayTransactionParser.makeDraft(
      transaction: message,
      amount: amount,
      merchant: merchant,
      date: date,
      source: .sms
    ) else {
      return .result()
    }

    do {
      switch try ApplePayTransactionStore.importInBackground(draft) {
      case .saved, .duplicate, .disabled:
        return .result()
      case .needsReview:
        await openReview(for: draft)
        return .result()
      }
    } catch {
      ApplePayTransactionStore.recordFailure(draft, error: error)
      await openReview(for: draft)
      return .result()
    }
  }

  @MainActor
  private func openReview(for draft: ApplePayTransactionDraft) async {
    var components = URLComponents()
    components.scheme = "financeapp"
    components.host = ""
    components.path = "/expense"

    var queryItems = [
      URLQueryItem(name: "source", value: draft.source.rawValue),
      URLQueryItem(name: "autoSave", value: "1"),
    ]

    if let rawText = draft.rawText, !rawText.isEmpty {
      queryItems.append(URLQueryItem(name: "text", value: rawText))
    }

    queryItems.append(URLQueryItem(name: "amount", value: String(format: "%.2f", draft.amount)))
    queryItems.append(URLQueryItem(name: "merchant", value: draft.merchant))
    queryItems.append(URLQueryItem(name: "category", value: draft.category))
    queryItems.append(URLQueryItem(name: "date", value: ISO8601DateFormatter().string(from: draft.occurredAt)))

    components.queryItems = queryItems

    if let url = components.url {
      await UIApplication.shared.open(url)
    }
  }
}

private enum TransactionAutomationSource: String {
  case wallet
  case sms

  var note: String {
    switch self {
    case .wallet:
      return "Imported from Wallet shortcut"
    case .sms:
      return "Imported from text message"
    }
  }

  var fallbackMerchant: String {
    switch self {
    case .wallet:
      return "Apple Pay"
    case .sms:
      return "Text alert"
    }
  }

  var settingsPrefix: String {
    switch self {
    case .wallet:
      return "applePayAutomation"
    case .sms:
      return "textAutomation"
    }
  }
}

private struct ApplePayTransactionDraft {
  let amount: Double
  let merchant: String
  let category: String
  let occurredAt: Date
  let rawText: String?
  let cardLast4: String?
  let confidence: Double
  let source: TransactionAutomationSource

  var note: String {
    source.note
  }
}

private enum ApplePayTransactionParser {
  private static let defaultCategory = "dining"
  private static let categoryKeywords: [String: String] = [
    "groceries": "groceries", "grocery": "groceries", "supermarket": "groceries",
    "market": "groceries",
    "dining": "dining", "dinner": "dining", "lunch": "dining", "breakfast": "dining",
    "brunch": "dining", "restaurant": "dining", "takeout": "dining", "food": "dining",
    "cafe": "dining", "latte": "dining", "espresso": "dining", "cappuccino": "dining",
    "cortado": "dining", "tea": "dining", "starbucks": "dining", "chipotle": "dining",
    "pinoy": "dining",
    "transport": "transport", "transit": "transport", "uber": "transport",
    "lyft": "transport", "taxi": "transport", "cab": "transport", "gas": "transport",
    "fuel": "transport", "shell": "transport", "chevron": "transport",
    "train": "transport", "bus": "transport", "parking": "transport",
    "shopping": "shopping", "shop": "shopping", "clothes": "shopping",
    "clothing": "shopping", "amazon": "shopping", "store": "shopping", "target": "shopping",
    "bill": "bills", "bills": "bills", "utility": "bills", "utilities": "bills",
    "rent": "bills", "electric": "bills", "electricity": "bills", "internet": "bills",
    "entertainment": "entertainment", "movie": "entertainment",
    "movies": "entertainment", "netflix": "entertainment", "spotify": "entertainment",
    "concert": "entertainment", "game": "entertainment", "games": "entertainment",
  ]
  private static let smsTransactionCue = #"\b(?:purchase|purchased|spent|charge|charged|transaction|authorization|authorized)\b|\b(?:card|visa|mastercard|amex)[^.!?]{0,50}\b(?:used|charged)\b"#
  private static let smsNonTransactionCue = #"\b(?:verification|security|one[-\s]?time|otp|login|password|fraud|declined|denied|blocked|payment\s+due|minimum\s+payment|statement|auto\s*pay|autopay|payment\s+(?:received|posted|processed)|deposit|transfer|refund|credit\s+limit)\b|\b(?:did\s+you|was\s+this\s+you)\b|\breply\s+(?:yes|no)\b"#

  static func makeDraft(
    transaction: String?,
    amount explicitAmount: Double?,
    merchant explicitMerchant: String?,
    date explicitDate: Date?,
    source: TransactionAutomationSource
  ) -> ApplePayTransactionDraft? {
    let rawText = transaction?.trimmedNonEmpty
    if rejectionReason(transaction: transaction, amount: explicitAmount, source: source) != nil {
      return nil
    }

    let amount = resolvedAmount(transaction: transaction, amount: explicitAmount) ?? 0
    guard amount > 0 else { return nil }

    let parsedMerchant = parseMerchant(rawText ?? "")
    let merchant = explicitMerchant?.trimmedNonEmpty.map(cleanupMerchant) ?? parsedMerchant
    let category = inferCategory(from: "\(merchant) \(rawText ?? "")")
    let confidence = explicitMerchant?.trimmedNonEmpty != nil || explicitAmount != nil
      ? 0.92
      : merchant.isEmpty ? 0.58 : 0.86

    return ApplePayTransactionDraft(
      amount: amount,
      merchant: merchant,
      category: category,
      occurredAt: explicitDate ?? Date(),
      rawText: rawText,
      cardLast4: parseCardLast4(rawText ?? ""),
      confidence: confidence,
      source: source
    )
  }

  static func rejectionReason(
    transaction: String?,
    amount explicitAmount: Double?,
    source: TransactionAutomationSource
  ) -> String? {
    let rawText = transaction?.trimmedNonEmpty
    if source == .sms, rawText == nil {
      return "No receipt text reached finance-app. In Shortcuts, tap the blank text field in Process Receipt and choose Shortcut Input."
    }

    guard resolvedAmount(transaction: transaction, amount: explicitAmount) != nil else {
      return "No transaction amount was found."
    }

    if source == .sms, let rawText {
      if rawText.firstRegexMatch(smsNonTransactionCue, options: [.caseInsensitive]) != nil {
        return "Ignored because this looks like a non-purchase card alert."
      }
      if rawText.firstRegexMatch(smsTransactionCue, options: [.caseInsensitive]) == nil {
        return "Ignored because the text did not include purchase, spent, charge, transaction, or authorized."
      }
    }

    return nil
  }

  static func resolvedAmount(transaction: String?, amount explicitAmount: Double?) -> Double? {
    let parsedAmount = parseAmount(transaction?.trimmedNonEmpty ?? "")
    let amount = explicitAmount.flatMap { $0 > 0 ? $0 : nil } ?? parsedAmount
    return amount > 0 ? amount : nil
  }

  private static func isLikelySmsTransaction(_ text: String) -> Bool {
    text.firstRegexMatch(smsTransactionCue, options: [.caseInsensitive]) != nil
      && text.firstRegexMatch(smsNonTransactionCue, options: [.caseInsensitive]) == nil
  }

  private static func parseAmount(_ text: String) -> Double {
    let pattern = #"(?:USD\s*)?\$?\s*([0-9]{1,6})(?:[.,]([0-9]{2}))\b|\b([0-9]{1,6})(?:[.,]([0-9]{2}))\s*(?:USD|dollars?)\b"#
    guard let match = text.firstRegexMatch(pattern) else { return 0 }
    let dollars = Int(match[safe: 1] ?? match[safe: 3] ?? "") ?? 0
    let cents = Int(match[safe: 2] ?? match[safe: 4] ?? "0") ?? 0
    return Double(dollars) + Double(cents) / 100
  }

  private static func parseCardLast4(_ text: String) -> String? {
    text.firstRegexMatch(#"(?:card|account|acct|ending|ends(?:\s+in)?)[^\d]{0,12}(?:[xX*.\s-]*)(\d{4})\b"#)?[safe: 1]
  }

  private static func parseMerchant(_ text: String) -> String {
    let patterns = [
      #"\b(?:at|from|to)\s+(.+)$"#,
      #"\bmerchant\s*[:=-]\s*(.+)$"#,
    ]

    for pattern in patterns {
      guard let raw = text.firstRegexMatch(pattern, options: [.caseInsensitive])?[safe: 1] else { continue }
      let stopped = raw.removingAfterFirstMatch(
        #"\b(?:with|using|on|for|from)\s+(?:your\s+)?(?:credit|debit|card|visa|mastercard|amex|account)\b|\b(?:card|account|acct)\s+(?:ending|ends(?:\s+in)?|[xX*.\s-]*\d{4})\b|\s+for\s+(?:USD\s*)?\$?\s*\d|(?:^|\s)(?:reply|msg|message|data|rates?|apply|stop|txt|available|balance)\b|[.。]\s*(?:reply|msg|message)\b"#,
        options: [.caseInsensitive]
      )
      let merchant = cleanupMerchant(stopped)
      if !merchant.isEmpty { return merchant }
    }

    let amountThenMerchantPatterns = [
      #"(?:USD\s*)?\$?\s*[0-9]{1,6}(?:[.,][0-9]{2})\b(?:\s+(?:was|is|has been))?(?:\s+(?:made|authorized|approved|posted|processed))?(?:\s+(?:at|to|from))?\s+(.+)$"#,
      #"\b[0-9]{1,6}(?:[.,][0-9]{2})\s*(?:USD|dollars?)\b(?:\s+(?:was|is|has been))?(?:\s+(?:made|authorized|approved|posted|processed))?(?:\s+(?:at|to|from))?\s+(.+)$"#,
    ]

    for pattern in amountThenMerchantPatterns {
      guard let raw = text.firstRegexMatch(pattern, options: [.caseInsensitive])?[safe: 1] else { continue }
      let candidate = raw
        .replacing(pattern: #"^(?:[\s:;,.=-]+|(?:was|is|has been)\s+|(?:made|authorized|approved|posted|processed)\s+|(?:at|to|from|merchant|purchase|charge|transaction)\s*)+"#, with: "", options: [.caseInsensitive])
      let stopped = candidate.removingAfterFirstMatch(
        #"\b(?:with|using|on|for|from)\s+(?:your\s+)?(?:credit|debit|card|visa|mastercard|amex|account)\b|\b(?:card|account|acct)\s+(?:ending|ends(?:\s+in)?|[xX*.\s-]*\d{4})\b|\s+for\s+(?:USD\s*)?\$?\s*\d|(?:^|\s)(?:reply|msg|message|data|rates?|apply|stop|txt|available|balance)\b|[.。]\s*(?:reply|msg|message)\b"#,
        options: [.caseInsensitive]
      )
      let merchant = cleanupMerchant(stopped)
      if !merchant.isEmpty { return merchant }
    }

    return ""
  }

  private static func cleanupMerchant(_ raw: String) -> String {
    var value = raw.compactedSpaces
      .replacing(pattern: #"^["'“”]+|["'“”]+$"#, with: "")
      .replacing(pattern: #"^[#*•\s-]+"#, with: "")
      .replacing(pattern: #"\s*[.,;:!]+$"#, with: "")

    value = value.replacing(pattern: #"^(?:SQ|TST|SP|PAYPAL|PP|POS|DEBIT|APPLE\s+PAY)\s*[*-]\s*"#, with: "", options: [.caseInsensitive])
    value = value.replacing(pattern: #"^(?:SQ|TST|SP)\s+"#, with: "", options: [.caseInsensitive])

    if value.count <= 3 { return value.uppercased() }
    if value.range(of: #"[a-z]"#, options: .regularExpression) != nil { return value }
    return value.lowercased().capitalized
  }

  private static func inferCategory(from text: String) -> String {
    let words = text.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter { !$0.isEmpty }
    for word in words {
      if let category = categoryKeywords[word] {
        return category
      }
    }
    return defaultCategory
  }
}

private enum ApplePayBackgroundImportOutcome {
  case saved
  case duplicate
  case disabled
  case needsReview
}

private enum TransactionAutomationMode: String {
  case off
  case confirm
  case autosave
}

private enum ApplePayTransactionStore {
  private static let databaseName = "finance-app.db"
  private static let defaultLedgerId = "ledger-default"
  private static let defaultUserId = "alex"
  private static let isoFormatter = ISO8601DateFormatter()

  static func importInBackground(_ draft: ApplePayTransactionDraft) throws -> ApplePayBackgroundImportOutcome {
    guard let databaseURL = databaseURL(), FileManager.default.fileExists(atPath: databaseURL.path) else {
      return .needsReview
    }

    let db = try SQLiteConnection(path: databaseURL.path)
    try db.exec("PRAGMA busy_timeout = 5000;")

    let meta = settingsMeta(db)
    let mode = automationMode(from: meta, source: draft.source)
    if mode == .off {
      try? recordRunStatus(db, meta: meta, draft: draft, status: "disabled", background: true)
      return .disabled
    }
    if mode == .confirm {
      try? recordRunStatus(db, meta: meta, draft: draft, status: "review", background: false)
      return .needsReview
    }

    let context = automationContext(db, meta: meta, source: draft.source)
    let merchant = draft.merchant.trimmedNonEmpty ?? draft.source.fallbackMerchant
    let category = validCategory(draft.category, db: db, ledgerId: context.ledgerId)
    let occurredAt = isoFormatter.string(from: draft.occurredAt)
    let fingerprint = automationFingerprint(draft: draft, merchant: merchant)

    if try isDuplicate(draft: draft, merchant: merchant, fingerprint: fingerprint, db: db, ledgerId: context.ledgerId) {
      try? recordRunStatus(db, meta: meta, draft: draft, status: "duplicate", background: true, fingerprint: fingerprint)
      return .duplicate
    }

    let now = isoFormatter.string(from: Date())
    let id = nextId(prefix: "tx")
    let metadata = jsonString([
      "merchantSource": draft.merchant.trimmedNonEmpty == nil ? "fallback" : "automation",
      "automationSource": draft.source.rawValue,
      "automationConfidence": draft.confidence,
      "cardLast4": draft.cardLast4 as Any,
      "automationOccurredAt": occurredAt,
      "automationFingerprint": fingerprint,
      "backgroundImported": true,
    ])

    try db.execute(
      """
      INSERT INTO transactions (
        id, type, amount, merchant, category, occurred_at, note, recurring,
        recurring_rule_id, visibility, created_by_user_id, updated_by_user_id,
        ledger_id, created_at, updated_at, cloud_record_name, cloud_zone_name,
        record_change_tag, sync_status, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      [
        .text(id),
        .text("expense"),
        .double(draft.amount),
        .text(merchant),
        .text(category),
        .text(occurredAt),
        .text(draft.note),
        .int(0),
        .null,
        .text("shared"),
        .text(context.userId),
        .text(context.userId),
        .text(context.ledgerId),
        .text(now),
        .text(now),
        .null,
        .null,
        .null,
        .text("pending"),
        metadata.map(SQLiteValue.text) ?? .null,
      ]
    )

    try? recordRunStatus(db, meta: meta, draft: draft, status: "saved", background: true, fingerprint: fingerprint, transactionId: id)
    return .saved
  }

  static func recordFailure(_ draft: ApplePayTransactionDraft, error: Error) {
    guard let databaseURL = databaseURL(), FileManager.default.fileExists(atPath: databaseURL.path),
          let db = try? SQLiteConnection(path: databaseURL.path)
    else {
      return
    }
    let meta = settingsMeta(db)
    try? recordRunStatus(
      db,
      meta: meta,
      draft: draft,
      status: "failed",
      background: false,
      errorMessage: sanitize(error: error)
    )
  }

  static func recordIgnored(source: TransactionAutomationSource, rawText: String?, amount: Double?, reason: String) {
    guard let databaseURL = databaseURL(), FileManager.default.fileExists(atPath: databaseURL.path),
          let db = try? SQLiteConnection(path: databaseURL.path)
    else {
      return
    }

    let meta = settingsMeta(db)
    try? recordIgnoredStatus(
      db,
      meta: meta,
      source: source,
      rawText: rawText?.trimmedNonEmpty,
      amount: amount,
      reason: reason
    )
  }

  private static func databaseURL() -> URL? {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
      .first?
      .appendingPathComponent("SQLite", isDirectory: true)
      .appendingPathComponent(databaseName)
  }

  private static func settingsMeta(_ db: SQLiteConnection) -> [String: Any] {
    guard
      let raw = try? db.scalarString("SELECT meta FROM settings WHERE id = ? LIMIT 1", [.text("settings")]),
      let data = raw.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return [:]
    }
    return object
  }

  private static func automationMode(from meta: [String: Any], source: TransactionAutomationSource) -> TransactionAutomationMode {
    guard let raw = meta["\(source.settingsPrefix)Mode"] as? String else { return .off }
    return TransactionAutomationMode(rawValue: raw) ?? .off
  }

  private static func automationContext(_ db: SQLiteConnection, meta: [String: Any], source: TransactionAutomationSource) -> (ledgerId: String, userId: String) {
    let ledgerId = (meta["\(source.settingsPrefix)LedgerId"] as? String)?.trimmedNonEmpty
      ?? (try? db.scalarString(
        "SELECT id FROM ledgers WHERE active = 1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1",
        []
      ))?.trimmedNonEmpty
      ?? defaultLedgerId

    let requestedUserId = (meta["\(source.settingsPrefix)UserId"] as? String)?.trimmedNonEmpty
    if let requestedUserId,
       (try? db.scalarString(
        "SELECT user_id FROM ledger_members WHERE ledger_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1",
        [.text(ledgerId), .text(requestedUserId)]
       )) != nil {
      return (ledgerId, requestedUserId)
    }

    let owner = (try? db.scalarString(
      "SELECT owner_user_id FROM ledgers WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [.text(ledgerId)]
    ))?.trimmedNonEmpty

    return (ledgerId, owner ?? defaultUserId)
  }

  private static func validCategory(_ category: String, db: SQLiteConnection, ledgerId: String) -> String {
    if (try? db.scalarString(
      "SELECT id FROM categories WHERE id = ? AND ledger_id = ? AND archived = 0 AND deleted_at IS NULL LIMIT 1",
      [.text(category), .text(ledgerId)]
    )) != nil {
      return category
    }

    return (try? db.scalarString(
      "SELECT id FROM categories WHERE ledger_id = ? AND archived = 0 AND deleted_at IS NULL ORDER BY group_key, sort_order, label LIMIT 1",
      [.text(ledgerId)]
    )) ?? "shopping"
  }

  private static func recordRunStatus(
    _ db: SQLiteConnection,
    meta: [String: Any],
    draft: ApplePayTransactionDraft,
    status: String,
    background: Bool,
    fingerprint: String? = nil,
    transactionId: String? = nil,
    errorMessage: String? = nil
  ) throws {
    let merchant = draft.merchant.trimmedNonEmpty ?? draft.source.fallbackMerchant
    let occurredAt = isoFormatter.string(from: draft.occurredAt)
    var nextMeta = meta
    let prefix = draft.source.settingsPrefix
    nextMeta["\(prefix)LastStatus"] = status
    nextMeta["\(prefix)LastRunAt"] = isoFormatter.string(from: Date())
    nextMeta["\(prefix)LastMerchant"] = merchant
    nextMeta["\(prefix)LastAmount"] = draft.amount
    nextMeta["\(prefix)LastOccurredAt"] = occurredAt
    nextMeta["\(prefix)LastFingerprint"] = fingerprint ?? automationFingerprint(draft: draft, merchant: merchant)
    nextMeta["\(prefix)LastTransactionId"] = transactionId
    nextMeta["\(prefix)LastBackground"] = background

    #if DEBUG
    if let rawText = draft.rawText {
      nextMeta["\(prefix)LastReplayText"] = rawText
    } else {
      nextMeta.removeValue(forKey: "\(prefix)LastReplayText")
    }
    nextMeta["\(prefix)LastReplayAmount"] = draft.amount
    nextMeta["\(prefix)LastReplayMerchant"] = merchant
    nextMeta["\(prefix)LastReplayOccurredAt"] = occurredAt
    nextMeta["\(prefix)LastReplayCategory"] = draft.category
    if let cardLast4 = draft.cardLast4 {
      nextMeta["\(prefix)LastReplayCardLast4"] = cardLast4
    } else {
      nextMeta.removeValue(forKey: "\(prefix)LastReplayCardLast4")
    }
    #else
    nextMeta.removeValue(forKey: "\(prefix)LastReplayText")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayAmount")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayMerchant")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayOccurredAt")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayCategory")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayCardLast4")
    #endif

    if let errorMessage {
      nextMeta["\(prefix)LastError"] = errorMessage
    } else {
      nextMeta.removeValue(forKey: "\(prefix)LastError")
    }

    try db.execute(
      "UPDATE settings SET meta = ? WHERE id = ?",
      [
        jsonString(nextMeta).map(SQLiteValue.text) ?? .null,
        .text("settings"),
      ]
    )
  }

  private static func recordIgnoredStatus(
    _ db: SQLiteConnection,
    meta: [String: Any],
    source: TransactionAutomationSource,
    rawText: String?,
    amount: Double?,
    reason: String
  ) throws {
    let now = isoFormatter.string(from: Date())
    var nextMeta = meta
    let prefix = source.settingsPrefix
    nextMeta["\(prefix)LastStatus"] = "ignored"
    nextMeta["\(prefix)LastRunAt"] = now
    nextMeta["\(prefix)LastMerchant"] = source.fallbackMerchant
    if let amount, amount > 0 {
      nextMeta["\(prefix)LastAmount"] = amount
    } else {
      nextMeta.removeValue(forKey: "\(prefix)LastAmount")
    }
    nextMeta.removeValue(forKey: "\(prefix)LastOccurredAt")
    nextMeta.removeValue(forKey: "\(prefix)LastFingerprint")
    nextMeta.removeValue(forKey: "\(prefix)LastTransactionId")
    nextMeta["\(prefix)LastBackground"] = true
    nextMeta["\(prefix)LastError"] = reason

    #if DEBUG
    if let rawText {
      nextMeta["\(prefix)LastReplayText"] = rawText
    } else {
      nextMeta.removeValue(forKey: "\(prefix)LastReplayText")
    }
    if let amount, amount > 0 {
      nextMeta["\(prefix)LastReplayAmount"] = amount
    } else {
      nextMeta.removeValue(forKey: "\(prefix)LastReplayAmount")
    }
    nextMeta["\(prefix)LastReplayMerchant"] = source.fallbackMerchant
    nextMeta["\(prefix)LastReplayOccurredAt"] = now
    nextMeta.removeValue(forKey: "\(prefix)LastReplayCategory")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayCardLast4")
    #else
    nextMeta.removeValue(forKey: "\(prefix)LastReplayText")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayAmount")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayMerchant")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayOccurredAt")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayCategory")
    nextMeta.removeValue(forKey: "\(prefix)LastReplayCardLast4")
    #endif

    try db.execute(
      "UPDATE settings SET meta = ? WHERE id = ?",
      [
        jsonString(nextMeta).map(SQLiteValue.text) ?? .null,
        .text("settings"),
      ]
    )
  }

  private static func isDuplicate(
    draft: ApplePayTransactionDraft,
    merchant: String,
    fingerprint: String,
    db: SQLiteConnection,
    ledgerId: String
  ) throws -> Bool {
    let windowStart = isoFormatter.string(from: draft.occurredAt.addingTimeInterval(-5 * 60))
    let windowEnd = isoFormatter.string(from: draft.occurredAt.addingTimeInterval(5 * 60))
    let normalizedMerchant = merchant.normalizedMerchantKey

    let rows = try db.stringRows(
      """
      SELECT merchant, meta FROM transactions
      WHERE ledger_id = ?
        AND deleted_at IS NULL
        AND type != 'income'
        AND ABS(amount - ?) < 0.005
        AND occurred_at BETWEEN ? AND ?
      """,
      [
        .text(ledgerId),
        .double(draft.amount),
        .text(windowStart),
        .text(windowEnd),
      ],
      columnCount: 2
    )
    return rows.contains { row in
      let txMerchant = row.indices.contains(0) ? row[0] ?? "" : ""
      let txMeta = jsonObject(row.indices.contains(1) ? row[1] : nil)
      if txMeta["automationFingerprint"] as? String == fingerprint {
        return true
      }
      guard txMerchant.normalizedMerchantKey == normalizedMerchant else {
        return false
      }
      if let draftCard = draft.cardLast4,
         let txCard = txMeta["cardLast4"] as? String,
         draftCard != txCard {
        return false
      }
      return true
    }
  }

  private static func automationFingerprint(draft: ApplePayTransactionDraft, merchant: String) -> String {
    let amountCents = Int((draft.amount * 100).rounded())
    let normalizedMerchant = merchant.normalizedMerchantKey.trimmedNonEmpty ?? "unknown"
    let minuteBucket = Int(floor(draft.occurredAt.timeIntervalSince1970 / 60))
    let cleanedCard = draft.cardLast4.map { String($0.replacing(pattern: #"\D+"#, with: "").suffix(4)) }
    let card = cleanedCard?.trimmedNonEmpty ?? "unknown"
    return "\(draft.source.rawValue):v1:\(amountCents):\(normalizedMerchant):\(minuteBucket):\(card)"
  }

  private static func jsonObject(_ raw: String?) -> [String: Any] {
    guard
      let raw,
      let data = raw.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return [:]
    }
    return object
  }

  private static func sanitize(error: Error) -> String {
    guard let sqliteError = error as? SQLiteError else {
      return "Background import failed"
    }
    switch sqliteError {
    case .openFailed:
      return "Database unavailable"
    case .prepareFailed, .stepFailed, .bindFailed:
      return "Database write failed"
    }
  }

  private static func jsonString(_ value: [String: Any]) -> String? {
    let cleaned = value.compactMapValues { item -> Any? in
      if item is NSNull { return nil }
      if let optional = item as? OptionalProtocol, optional.isNil { return nil }
      return item
    }
    guard JSONSerialization.isValidJSONObject(cleaned),
          let data = try? JSONSerialization.data(withJSONObject: cleaned)
    else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private static func nextId(prefix: String) -> String {
    let millis = Int(Date().timeIntervalSince1970 * 1000)
    let suffix = UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(6).lowercased()
    return "\(prefix)-\(millis)-\(suffix)"
  }
}

private protocol OptionalProtocol {
  var isNil: Bool { get }
}

extension Optional: OptionalProtocol {
  var isNil: Bool { self == nil }
}

private enum SQLiteValue {
  case null
  case text(String)
  case double(Double)
  case int(Int)
}

private enum SQLiteError: Error {
  case openFailed(String)
  case prepareFailed(String)
  case stepFailed(String)
  case bindFailed(String)
}

private let SQLITE_TRANSIENT = unsafeBitCast(OpaquePointer(bitPattern: -1), to: sqlite3_destructor_type.self)

private final class SQLiteConnection {
  private let db: OpaquePointer

  init(path: String) throws {
    var pointer: OpaquePointer?
    let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
    guard sqlite3_open_v2(path, &pointer, flags, nil) == SQLITE_OK, let pointer else {
      let message = pointer.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
      throw SQLiteError.openFailed(message)
    }
    db = pointer
    sqlite3_busy_timeout(db, 5000)
  }

  deinit {
    sqlite3_close(db)
  }

  func exec(_ sql: String) throws {
    guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else {
      throw SQLiteError.stepFailed(String(cString: sqlite3_errmsg(db)))
    }
  }

  func execute(_ sql: String, _ values: [SQLiteValue]) throws {
    let statement = try prepare(sql, values)
    defer { sqlite3_finalize(statement) }
    guard sqlite3_step(statement) == SQLITE_DONE else {
      throw SQLiteError.stepFailed(String(cString: sqlite3_errmsg(db)))
    }
  }

  func scalarString(_ sql: String, _ values: [SQLiteValue]) throws -> String? {
    let statement = try prepare(sql, values)
    defer { sqlite3_finalize(statement) }
    guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
    guard let text = sqlite3_column_text(statement, 0) else { return nil }
    return String(cString: text)
  }

  func scalarStrings(_ sql: String, _ values: [SQLiteValue]) throws -> [String] {
    let statement = try prepare(sql, values)
    defer { sqlite3_finalize(statement) }
    var rows: [String] = []
    while true {
      let result = sqlite3_step(statement)
      if result == SQLITE_ROW {
        if let text = sqlite3_column_text(statement, 0) {
          rows.append(String(cString: text))
        }
      } else if result == SQLITE_DONE {
        return rows
      } else {
        throw SQLiteError.stepFailed(String(cString: sqlite3_errmsg(db)))
      }
    }
  }

  func stringRows(_ sql: String, _ values: [SQLiteValue], columnCount: Int) throws -> [[String?]] {
    let statement = try prepare(sql, values)
    defer { sqlite3_finalize(statement) }
    var rows: [[String?]] = []
    while true {
      let result = sqlite3_step(statement)
      if result == SQLITE_ROW {
        rows.append((0..<columnCount).map { index in
          guard let text = sqlite3_column_text(statement, Int32(index)) else { return nil }
          return String(cString: text)
        })
      } else if result == SQLITE_DONE {
        return rows
      } else {
        throw SQLiteError.stepFailed(String(cString: sqlite3_errmsg(db)))
      }
    }
  }

  private func prepare(_ sql: String, _ values: [SQLiteValue]) throws -> OpaquePointer {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      throw SQLiteError.prepareFailed(String(cString: sqlite3_errmsg(db)))
    }
    do {
      try bind(values, to: statement)
    } catch {
      sqlite3_finalize(statement)
      throw error
    }
    return statement
  }

  private func bind(_ values: [SQLiteValue], to statement: OpaquePointer) throws {
    for (index, value) in values.enumerated() {
      let position = Int32(index + 1)
      let result: Int32
      switch value {
      case .null:
        result = sqlite3_bind_null(statement, position)
      case .text(let text):
        result = sqlite3_bind_text(statement, position, text, -1, SQLITE_TRANSIENT)
      case .double(let double):
        result = sqlite3_bind_double(statement, position, double)
      case .int(let int):
        result = sqlite3_bind_int64(statement, position, sqlite3_int64(int))
      }
      if result != SQLITE_OK {
        throw SQLiteError.bindFailed(String(cString: sqlite3_errmsg(db)))
      }
    }
  }
}

private extension String {
  var trimmedNonEmpty: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }

  var compactedSpaces: String {
    replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  var normalizedMerchantKey: String {
    lowercased()
      .replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
      .compactedSpaces
  }

  func replacing(
    pattern: String,
    with replacement: String,
    options: NSRegularExpression.Options = []
  ) -> String {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return self }
    let range = NSRange(startIndex..<endIndex, in: self)
    return regex.stringByReplacingMatches(in: self, options: [], range: range, withTemplate: replacement)
  }

  func firstRegexMatch(
    _ pattern: String,
    options: NSRegularExpression.Options = []
  ) -> [String]? {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return nil }
    let range = NSRange(startIndex..<endIndex, in: self)
    guard let match = regex.firstMatch(in: self, options: [], range: range) else { return nil }
    return (0..<match.numberOfRanges).map { index in
      let range = match.range(at: index)
      guard let swiftRange = Range(range, in: self) else { return "" }
      return String(self[swiftRange])
    }
  }

  func removingAfterFirstMatch(
    _ pattern: String,
    options: NSRegularExpression.Options = []
  ) -> String {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: options) else { return self }
    let range = NSRange(startIndex..<endIndex, in: self)
    guard let match = regex.firstMatch(in: self, options: [], range: range),
          let swiftRange = Range(match.range, in: self)
    else {
      return self
    }
    return String(self[..<swiftRange.lowerBound])
  }
}

private extension Array {
  subscript(safe index: Int) -> Element? {
    indices.contains(index) ? self[index] : nil
  }
}
