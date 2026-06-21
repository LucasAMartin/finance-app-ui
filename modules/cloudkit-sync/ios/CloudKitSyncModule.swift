import CloudKit
import ExpoModulesCore

public class CloudKitSyncModule: Module {
  private let container = CKContainer.default()
  private var database: CKDatabase { container.privateCloudDatabase }
  private let syncMetadataKeys: Set<String> = [
    "appSyncCreatedByUserId",
    "appSyncUpdatedByUserId",
    "appSyncCreatedAt",
    "appSyncUpdatedAt",
    "appSyncDeletedAt"
  ]
  private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  public func definition() -> ModuleDefinition {
    Name("CloudKitSync")

    AsyncFunction("getCurrentUser") { () async throws -> [String: Any] in
      let status = try await self.accountStatus()
      guard status == .available else {
        return [
          "available": false,
          "reason": self.reason(for: status)
        ]
      }
      let userRecordID = try await self.userRecordID()
      return [
        "available": true,
        "userId": userRecordID.recordName
      ]
    }

    AsyncFunction("pullChanges") { (zoneName: String, sinceToken: String?) async throws -> [String: Any] in
      try await self.ensureZone(zoneName)
      return try await self.pullChangesResilient(zoneName: zoneName, sinceToken: sinceToken)
    }

    AsyncFunction("pushRecords") { (zoneName: String, records: [[String: Any]]) async throws -> [String: Any] in
      try await self.ensureZone(zoneName)
      return try await self.pushRecords(zoneName: zoneName, payloads: records)
    }

    AsyncFunction("resetZone") { (zoneName: String) async throws -> [String: Any] in
      let id = self.zoneID(zoneName)
      do {
        _ = try await self.deleteZone(id)
      } catch {
        if !self.isNotFound(error) { throw error }
      }
      _ = try await self.saveZone(CKRecordZone(zoneID: id))
      return [
        "zoneName": zoneName,
        "reset": true
      ]
    }
  }

  private func accountStatus() async throws -> CKAccountStatus {
    try await withCheckedThrowingContinuation { continuation in
      container.accountStatus { status, error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: status)
        }
      }
    }
  }

  private func userRecordID() async throws -> CKRecord.ID {
    try await withCheckedThrowingContinuation { continuation in
      container.fetchUserRecordID { recordID, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let recordID {
          continuation.resume(returning: recordID)
        } else {
          continuation.resume(throwing: CloudKitSyncError.missingUserRecord)
        }
      }
    }
  }

  private func reason(for status: CKAccountStatus) -> String {
    switch status {
    case .noAccount:
      return "signed-out"
    case .couldNotDetermine, .restricted:
      return "unavailable"
    case .temporarilyUnavailable:
      return "unavailable"
    case .available:
      return "unavailable"
    @unknown default:
      return "unavailable"
    }
  }

  private func zoneID(_ zoneName: String) -> CKRecordZone.ID {
    CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)
  }

  private func ledgerId(from zoneName: String) -> String {
    zoneName.hasPrefix("zone-") ? String(zoneName.dropFirst(5)) : zoneName
  }

  private func ensureZone(_ zoneName: String) async throws {
    let id = zoneID(zoneName)
    do {
      _ = try await fetchZone(id)
    } catch {
      if !isNotFound(error) { throw error }
      _ = try await saveZone(CKRecordZone(zoneID: id))
    }
  }

  private func fetchZone(_ zoneID: CKRecordZone.ID) async throws -> CKRecordZone {
    try await withCheckedThrowingContinuation { continuation in
      database.fetch(withRecordZoneID: zoneID) { zone, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let zone {
          continuation.resume(returning: zone)
        } else {
          continuation.resume(throwing: CloudKitSyncError.missingZone)
        }
      }
    }
  }

  private func saveZone(_ zone: CKRecordZone) async throws -> CKRecordZone {
    try await withCheckedThrowingContinuation { continuation in
      database.save(zone) { savedZone, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let savedZone {
          continuation.resume(returning: savedZone)
        } else {
          continuation.resume(throwing: CloudKitSyncError.missingZone)
        }
      }
    }
  }

  private func deleteZone(_ zoneID: CKRecordZone.ID) async throws -> CKRecordZone.ID {
    try await withCheckedThrowingContinuation { continuation in
      database.delete(withRecordZoneID: zoneID) { deletedID, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let deletedID {
          continuation.resume(returning: deletedID)
        } else {
          continuation.resume(throwing: CloudKitSyncError.missingZone)
        }
      }
    }
  }

  private func pullChanges(zoneName: String, sinceToken: String?) async throws -> [String: Any] {
    let zoneID = zoneID(zoneName)
    let previousToken = try decodeChangeToken(sinceToken)

    return try await withCheckedThrowingContinuation { continuation in
      var records: [[String: Any]] = []
      var latestToken: CKServerChangeToken?
      var operationError: Error?

      let config = CKFetchRecordZoneChangesOperation.ZoneConfiguration()
      config.previousServerChangeToken = previousToken

      let operation = CKFetchRecordZoneChangesOperation(
        recordZoneIDs: [zoneID],
        configurationsByRecordZoneID: [zoneID: config]
      )

      operation.recordChangedBlock = { [weak self] record in
        guard let self else { return }
        records.append(self.payload(from: record, zoneName: zoneName))
      }

      operation.recordWithIDWasDeletedBlock = { [weak self] recordID, recordType in
        guard let self else { return }
        let now = self.isoFormatter.string(from: Date())
        records.append([
          "recordName": recordID.recordName,
          "recordType": recordType,
          "zoneName": zoneName,
          "ledgerId": self.ledgerId(from: zoneName),
          "fields": [:],
          "updatedAt": now,
          "deletedAt": now,
          "syncStatus": "synced"
        ])
      }

      operation.recordZoneChangeTokensUpdatedBlock = { _, token, _ in
        latestToken = token
      }

      operation.recordZoneFetchCompletionBlock = { _, token, _, _, error in
        latestToken = token ?? latestToken
        operationError = error
      }

      operation.fetchRecordZoneChangesCompletionBlock = { [weak self] error in
        if let error = error ?? operationError {
          continuation.resume(throwing: error)
          return
        }
        let tokenString = try? self?.encodeChangeToken(latestToken)
        continuation.resume(returning: [
          "records": records,
          "changeToken": tokenString as Any
        ])
      }

      database.add(operation)
    }
  }

  private func pullChangesResilient(zoneName: String, sinceToken: String?) async throws -> [String: Any] {
    do {
      return try await pullChanges(zoneName: zoneName, sinceToken: sinceToken)
    } catch {
      guard sinceToken != nil, isRecoverableChangeTokenError(error) else { throw error }
      return try await pullChanges(zoneName: zoneName, sinceToken: nil)
    }
  }

  private func pushRecords(zoneName: String, payloads: [[String: Any]]) async throws -> [String: Any] {
    var accepted: [[String: Any]] = []
    var conflicts: [[String: Any]] = []

    for payload in payloads {
      let recordName = string(payload["recordName"]) ?? UUID().uuidString
      let recordType = string(payload["recordType"]) ?? "transaction"
      let recordID = CKRecord.ID(recordName: recordName, zoneID: zoneID(zoneName))
      let localTag = string(payload["recordChangeTag"])
      let localDeletedAt = string(payload["deletedAt"])
      let existing = try await fetchRecordIfExists(recordID)

      if let existing, let localTag, existing.recordChangeTag != localTag {
        conflicts.append([
          "local": payload,
          "remote": self.payload(from: existing, zoneName: zoneName),
          "reason": "remote-newer"
        ])
        continue
      }

      if localDeletedAt != nil {
        do {
          _ = try await deleteRecord(recordID)
        } catch {
          if !isNotFound(error) { throw error }
        }
        accepted.append(payload.merging([
          "recordChangeTag": NSNull(),
          "syncStatus": "synced"
        ]) { _, next in next })
        continue
      }

      let record = existing ?? CKRecord(recordType: recordType, recordID: recordID)
      if let fields = payload["fields"] as? [String: Any] {
        apply(fields: fields, to: record)
      }
      applySyncMetadata(from: payload, to: record)
      let saved = try await saveRecord(record)
      accepted.append(self.payload(from: saved, zoneName: zoneName))
    }

    return [
      "accepted": accepted,
      "conflicts": conflicts
    ]
  }

  private func fetchRecordIfExists(_ recordID: CKRecord.ID) async throws -> CKRecord? {
    try await withCheckedThrowingContinuation { continuation in
      database.fetch(withRecordID: recordID) { record, error in
        if let error {
          if self.isNotFound(error) {
            continuation.resume(returning: nil)
          } else {
            continuation.resume(throwing: error)
          }
        } else {
          continuation.resume(returning: record)
        }
      }
    }
  }

  private func saveRecord(_ record: CKRecord) async throws -> CKRecord {
    try await withCheckedThrowingContinuation { continuation in
      database.save(record) { saved, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let saved {
          continuation.resume(returning: saved)
        } else {
          continuation.resume(throwing: CloudKitSyncError.missingRecord)
        }
      }
    }
  }

  private func deleteRecord(_ recordID: CKRecord.ID) async throws -> CKRecord.ID {
    try await withCheckedThrowingContinuation { continuation in
      database.delete(withRecordID: recordID) { deletedID, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let deletedID {
          continuation.resume(returning: deletedID)
        } else {
          continuation.resume(throwing: CloudKitSyncError.missingRecord)
        }
      }
    }
  }

  private func payload(from record: CKRecord, zoneName: String) -> [String: Any] {
    var fields: [String: Any] = [:]
    record.allKeys().forEach { key in
      if syncMetadataKeys.contains(key) { return }
      if let value = record[key] {
        fields[key] = decodeRecordValue(value)
      }
    }

    var payload: [String: Any] = [
      "recordName": record.recordID.recordName,
      "recordType": record.recordType,
      "zoneName": zoneName,
      "ledgerId": ledgerId(from: zoneName),
      "fields": fields,
      "updatedAt": recordString(record["appSyncUpdatedAt"]) ?? isoFormatter.string(from: record.modificationDate ?? Date()),
      "syncStatus": "synced"
    ]
    if let createdByUserId = recordString(record["appSyncCreatedByUserId"]) {
      payload["createdByUserId"] = createdByUserId
    }
    if let updatedByUserId = recordString(record["appSyncUpdatedByUserId"]) {
      payload["updatedByUserId"] = updatedByUserId
    }
    if let createdAt = recordString(record["appSyncCreatedAt"]) {
      payload["createdAt"] = createdAt
    } else if let createdAt = record.creationDate {
      payload["createdAt"] = isoFormatter.string(from: createdAt)
    }
    if let deletedAt = recordString(record["appSyncDeletedAt"]) {
      payload["deletedAt"] = deletedAt
    }
    if let tag = record.recordChangeTag {
      payload["recordChangeTag"] = tag
    }
    return payload
  }

  private func apply(fields: [String: Any], to record: CKRecord) {
    fields.forEach { key, value in
      if value is NSNull {
        record[key] = nil
      } else if let recordValue = encodeRecordValue(value) {
        record[key] = recordValue
      } else {
        record[key] = nil
      }
    }
  }

  private func applySyncMetadata(from payload: [String: Any], to record: CKRecord) {
    applySyncMetadataValue(payload["createdByUserId"], key: "appSyncCreatedByUserId", to: record)
    applySyncMetadataValue(payload["updatedByUserId"], key: "appSyncUpdatedByUserId", to: record)
    applySyncMetadataValue(payload["createdAt"], key: "appSyncCreatedAt", to: record)
    applySyncMetadataValue(payload["updatedAt"], key: "appSyncUpdatedAt", to: record)
    applySyncMetadataValue(payload["deletedAt"], key: "appSyncDeletedAt", to: record)
  }

  private func applySyncMetadataValue(_ value: Any?, key: String, to record: CKRecord) {
    guard let value else { return }
    if value is NSNull {
      record[key] = nil
      return
    }
    guard let stringValue = string(value), !stringValue.isEmpty else { return }
    record[key] = stringValue as NSString
  }

  private func recordString(_ value: CKRecordValue?) -> String? {
    if let value = value as? String, !value.isEmpty {
      return value
    }
    if let value = value as? NSString, value.length > 0 {
      return value as String
    }
    return nil
  }

  private func encodeRecordValue(_ value: Any) -> CKRecordValue? {
    if let value = value as? String { return value as NSString }
    if let value = value as? Bool { return NSNumber(value: value) }
    if let value = value as? Int { return NSNumber(value: value) }
    if let value = value as? Double { return NSNumber(value: value) }
    if let value = value as? Float { return NSNumber(value: value) }
    if JSONSerialization.isValidJSONObject(value),
       let data = try? JSONSerialization.data(withJSONObject: value),
       let string = String(data: data, encoding: .utf8) {
      return string as NSString
    }
    return nil
  }

  private func decodeRecordValue(_ value: CKRecordValue) -> Any {
    if let number = value as? NSNumber {
      return CFGetTypeID(number) == CFBooleanGetTypeID() ? number.boolValue : number.doubleValue
    }
    if let string = value as? String {
      let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
      if (trimmed.hasPrefix("{") || trimmed.hasPrefix("[")),
         let data = string.data(using: .utf8),
         let json = try? JSONSerialization.jsonObject(with: data) {
        return json
      }
      return string
    }
    return String(describing: value)
  }

  private func encodeChangeToken(_ token: CKServerChangeToken?) throws -> String? {
    guard let token else { return nil }
    let data = try NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
    return data.base64EncodedString()
  }

  private func decodeChangeToken(_ value: String?) throws -> CKServerChangeToken? {
    guard let value, let data = Data(base64Encoded: value) else { return nil }
    return try NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: data)
  }

  private func isNotFound(_ error: Error) -> Bool {
    guard let ckError = error as? CKError else { return false }
    return ckError.code == .unknownItem || ckError.code == .zoneNotFound
  }

  private func isRecoverableChangeTokenError(_ error: Error) -> Bool {
    guard let ckError = error as? CKError else { return false }
    if ckError.code == .changeTokenExpired || ckError.code == .zoneNotFound || ckError.code == .unknownItem {
      return true
    }
    guard ckError.code == .partialFailure,
          let partialErrors = ckError.partialErrorsByItemID else {
      return false
    }
    return partialErrors.values.contains { partialError in
      guard let partialCKError = partialError as? CKError else { return false }
      return partialCKError.code == .changeTokenExpired ||
        partialCKError.code == .zoneNotFound ||
        partialCKError.code == .unknownItem
    }
  }

  private func string(_ value: Any?) -> String? {
    value as? String
  }
}

private enum CloudKitSyncError: Error {
  case missingUserRecord
  case missingZone
  case missingRecord
}
