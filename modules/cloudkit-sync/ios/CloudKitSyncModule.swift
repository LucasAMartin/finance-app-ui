import CloudKit
import ExpoModulesCore
import UIKit

public class CloudKitSyncModule: Module {
  private let container = CKContainer.default()
  private let sharingDelegate = CloudKitSharingControllerDelegate()
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

    AsyncFunction("pullChangesInDatabase") { (zoneName: String, sinceToken: String?, databaseScope: String, ownerName: String?) async throws -> [String: Any] in
      let route = try self.databaseRoute(zoneName: zoneName, databaseScope: databaseScope, ownerName: ownerName)
      if route.databaseScope == .privateScope {
        try await self.ensureZone(route)
      }
      return try await self.pullChangesResilient(route: route, sinceToken: sinceToken)
    }

    AsyncFunction("pushRecordsInDatabase") { (zoneName: String, records: [[String: Any]], databaseScope: String, ownerName: String?) async throws -> [String: Any] in
      let route = try self.databaseRoute(zoneName: zoneName, databaseScope: databaseScope, ownerName: ownerName)
      if route.databaseScope == .privateScope {
        try await self.ensureZone(route)
      }
      return try await self.pushRecords(route: route, payloads: records)
    }

    AsyncFunction("resetZone") { (zoneName: String) async throws -> [String: Any] in
      let id = self.zoneID(zoneName)
      do {
        _ = try await self.deleteZone(id)
      } catch {
        if !Self.isNotFound(error) { throw error }
      }
      _ = try await self.saveZone(CKRecordZone(zoneID: id))
      return [
        "zoneName": zoneName,
        "reset": true
      ]
    }

    AsyncFunction("presentLedgerShare") { (ledgerId: String, title: String?) async throws -> [String: Any] in
      let zoneName = "zone-\(ledgerId)"
      let shareTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        ? title!.trimmingCharacters(in: .whitespacesAndNewlines)
        : "Shared finance ledger"
      try await self.ensureZone(zoneName)
      let share = try await self.fetchOrCreateZoneWideShare(zoneName: zoneName, title: shareTitle)
      try await self.presentCloudSharingController(share, title: shareTitle)

      var result: [String: Any] = ["ledgerId": ledgerId]
      if let url = share.url?.absoluteString {
        result["shareUrl"] = url
      }
      return result
    }

    AsyncFunction("stopSharingLedger") { (ledgerId: String) async throws -> [String: Any] in
      let zoneName = "zone-\(ledgerId)"
      let shareID = self.zoneWideShareRecordID(zoneName: zoneName)
      do {
        _ = try await self.deleteRecord(shareID)
        return [
          "ledgerId": ledgerId,
          "stopped": true
        ]
      } catch {
        if Self.isNotFound(error) {
          return [
            "ledgerId": ledgerId,
            "stopped": false
          ]
        }
        throw error
      }
    }

    AsyncFunction("consumeAcceptedShares") { () -> [[String: Any]] in
      CloudKitAcceptedShareStore.shared.consume()
    }

    AsyncFunction("ensureSubscriptions") { (zoneName: String, databaseScope: String, ownerName: String?) async throws -> [String: Any] in
      let route = try self.databaseRoute(zoneName: zoneName, databaseScope: databaseScope, ownerName: ownerName)
      if route.databaseScope == .privateScope {
        try await self.ensureZone(route)
      }
      await MainActor.run {
        UIApplication.shared.registerForRemoteNotifications()
      }
      _ = try await self.saveZoneSubscription(route)
      return [
        "zoneName": route.zoneName,
        "databaseScope": route.databaseScope.stringValue,
        "subscribed": true
      ]
    }

    AsyncFunction("consumeRemoteNotifications") { () -> [[String: Any]] in
      CloudKitRemoteChangeStore.shared.consume()
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

  private func databaseRoute(zoneName: String, databaseScope: String, ownerName: String?) throws -> CloudKitDatabaseRoute {
    if databaseScope == "shared" {
      guard let ownerName, !ownerName.isEmpty else {
        throw CloudKitSyncError.missingSharedOwner
      }
      return CloudKitDatabaseRoute(
        database: container.sharedCloudDatabase,
        databaseScope: .sharedScope,
        zoneID: CKRecordZone.ID(zoneName: zoneName, ownerName: ownerName),
        zoneName: zoneName
      )
    }
    return CloudKitDatabaseRoute(
      database: container.privateCloudDatabase,
      databaseScope: .privateScope,
      zoneID: zoneID(zoneName),
      zoneName: zoneName
    )
  }

  private func ledgerId(from zoneName: String) -> String {
    zoneName.hasPrefix("zone-") ? String(zoneName.dropFirst(5)) : zoneName
  }

  private func ensureZone(_ zoneName: String) async throws {
    try await ensureZone(CloudKitDatabaseRoute(
      database: container.privateCloudDatabase,
      databaseScope: .privateScope,
      zoneID: zoneID(zoneName),
      zoneName: zoneName
    ))
  }

  private func ensureZone(_ route: CloudKitDatabaseRoute) async throws {
    let id = route.zoneID
    do {
      _ = try await fetchZone(id, in: route.database)
    } catch {
      if !Self.isNotFound(error) { throw error }
      _ = try await saveZone(CKRecordZone(zoneID: id), in: route.database)
    }
  }

  private func fetchZone(_ zoneID: CKRecordZone.ID, in database: CKDatabase? = nil) async throws -> CKRecordZone {
    try await withCheckedThrowingContinuation { continuation in
      (database ?? self.database).fetch(withRecordZoneID: zoneID) { zone, error in
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

  private func saveZone(_ zone: CKRecordZone, in database: CKDatabase? = nil) async throws -> CKRecordZone {
    try await withCheckedThrowingContinuation { continuation in
      (database ?? self.database).save(zone) { savedZone, error in
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

  private func zoneWideShareRecordID(zoneName: String) -> CKRecord.ID {
    CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zoneID(zoneName))
  }

  private func isShareRecord(_ record: CKRecord) -> Bool {
    record is CKShare || isShareRecordID(record.recordID)
  }

  private func isShareRecordID(_ recordID: CKRecord.ID) -> Bool {
    recordID.recordName == CKRecordNameZoneWideShare
  }

  private func fetchOrCreateZoneWideShare(zoneName: String, title: String) async throws -> CKShare {
    if let existing = try await fetchRecordIfExists(zoneWideShareRecordID(zoneName: zoneName)) {
      guard let share = existing as? CKShare else {
        throw CloudKitSyncError.invalidShareRecord
      }
      if share[CKShare.SystemFieldKey.title] as? String != title {
        share[CKShare.SystemFieldKey.title] = title as NSString
        return try await saveShare(share)
      }
      return share
    }

    let share = CKShare(recordZoneID: zoneID(zoneName))
    share[CKShare.SystemFieldKey.title] = title as NSString
    share.publicPermission = .none
    return try await saveShare(share)
  }

  private func subscriptionID(_ route: CloudKitDatabaseRoute) -> String {
    let owner = route.zoneID.ownerName.replacingOccurrences(of: ":", with: "_")
    return "finance-sync-\(route.databaseScope.stringValue)-\(owner)-\(route.zoneName)"
  }

  private func saveZoneSubscription(_ route: CloudKitDatabaseRoute) async throws -> CKSubscription {
    let id = subscriptionID(route)
    if let existing = try await fetchSubscriptionIfExists(id, in: route.database) {
      return existing
    }
    let subscription = CKRecordZoneSubscription(zoneID: route.zoneID, subscriptionID: id)
    let notificationInfo = CKSubscription.NotificationInfo()
    notificationInfo.shouldSendContentAvailable = true
    notificationInfo.shouldBadge = false
    subscription.notificationInfo = notificationInfo
    return try await saveSubscription(subscription, in: route.database)
  }

  private func fetchSubscriptionIfExists(_ subscriptionID: String, in database: CKDatabase) async throws -> CKSubscription? {
    try await withCheckedThrowingContinuation { continuation in
      database.fetch(withSubscriptionID: subscriptionID) { subscription, error in
        if let error {
          if Self.isNotFound(error) {
            continuation.resume(returning: nil)
          } else {
            continuation.resume(throwing: error)
          }
        } else {
          continuation.resume(returning: subscription)
        }
      }
    }
  }

  private func saveSubscription(_ subscription: CKSubscription, in database: CKDatabase) async throws -> CKSubscription {
    try await withCheckedThrowingContinuation { continuation in
      database.save(subscription) { saved, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let saved {
          continuation.resume(returning: saved)
        } else {
          continuation.resume(throwing: CloudKitSyncError.missingSubscription)
        }
      }
    }
  }

  private func saveShare(_ share: CKShare) async throws -> CKShare {
    let saved = try await saveRecord(share)
    guard let savedShare = saved as? CKShare else {
      throw CloudKitSyncError.invalidShareRecord
    }
    return savedShare
  }

  @MainActor
  private func presentCloudSharingController(_ share: CKShare, title: String) throws {
    guard let presenter = Self.topViewController() else {
      throw CloudKitSyncError.missingPresenter
    }

    let controller = UICloudSharingController(share: share, container: container)
    sharingDelegate.itemTitle = title
    controller.delegate = sharingDelegate
    if let popover = controller.popoverPresentationController {
      popover.sourceView = presenter.view
      popover.sourceRect = CGRect(
        x: presenter.view.bounds.midX,
        y: presenter.view.bounds.midY,
        width: 1,
        height: 1
      )
      popover.permittedArrowDirections = []
    }
    presenter.present(controller, animated: true)
  }

  @MainActor
  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes
      .first { $0.activationState == .foregroundActive }?
      .windows
      .first { $0.isKeyWindow }
    return topViewController(from: window?.rootViewController)
  }

  @MainActor
  private static func topViewController(from controller: UIViewController?) -> UIViewController? {
    if let navigation = controller as? UINavigationController {
      return topViewController(from: navigation.visibleViewController)
    }
    if let tab = controller as? UITabBarController {
      return topViewController(from: tab.selectedViewController)
    }
    if let presented = controller?.presentedViewController {
      return topViewController(from: presented)
    }
    return controller
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

      operation.recordWasChangedBlock = { [weak self] _, recordResult in
        guard let self else { return }
        switch recordResult {
        case .success(let record):
          if self.isShareRecord(record) { return }
          records.append(self.payload(from: record, zoneName: zoneName))
        case .failure(let error):
          operationError = error
        }
      }

      operation.recordWithIDWasDeletedBlock = { [weak self] recordID, recordType in
        guard let self else { return }
        if self.isShareRecordID(recordID) { return }
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

      operation.recordZoneFetchResultBlock = { _, fetchChangesResult in
        switch fetchChangesResult {
        case .success(let result):
          latestToken = result.serverChangeToken
        case .failure(let error):
          operationError = error
        }
      }

      operation.fetchRecordZoneChangesResultBlock = { [weak self] result in
        if case .failure(let error) = result {
          continuation.resume(throwing: error)
          return
        }
        if let error = operationError {
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

  private func pullChangesResilient(route: CloudKitDatabaseRoute, sinceToken: String?) async throws -> [String: Any] {
    do {
      return try await pullChanges(route: route, sinceToken: sinceToken)
    } catch {
      guard sinceToken != nil, isRecoverableChangeTokenError(error) else { throw error }
      return try await pullChanges(route: route, sinceToken: nil)
    }
  }

  private func pullChanges(route: CloudKitDatabaseRoute, sinceToken: String?) async throws -> [String: Any] {
    let previousToken = try decodeChangeToken(sinceToken)

    return try await withCheckedThrowingContinuation { continuation in
      var records: [[String: Any]] = []
      var latestToken: CKServerChangeToken?
      var operationError: Error?

      let config = CKFetchRecordZoneChangesOperation.ZoneConfiguration()
      config.previousServerChangeToken = previousToken

      let operation = CKFetchRecordZoneChangesOperation(
        recordZoneIDs: [route.zoneID],
        configurationsByRecordZoneID: [route.zoneID: config]
      )

      operation.recordWasChangedBlock = { [weak self] _, recordResult in
        guard let self else { return }
        switch recordResult {
        case .success(let record):
          if self.isShareRecord(record) { return }
          records.append(self.payload(from: record, zoneName: route.zoneName))
        case .failure(let error):
          operationError = error
        }
      }

      operation.recordWithIDWasDeletedBlock = { [weak self] recordID, recordType in
        guard let self else { return }
        if self.isShareRecordID(recordID) { return }
        let now = self.isoFormatter.string(from: Date())
        records.append([
          "recordName": recordID.recordName,
          "recordType": recordType,
          "zoneName": route.zoneName,
          "ledgerId": self.ledgerId(from: route.zoneName),
          "fields": [:],
          "updatedAt": now,
          "deletedAt": now,
          "syncStatus": "synced"
        ])
      }

      operation.recordZoneChangeTokensUpdatedBlock = { _, token, _ in
        latestToken = token
      }

      operation.recordZoneFetchResultBlock = { _, fetchChangesResult in
        switch fetchChangesResult {
        case .success(let result):
          latestToken = result.serverChangeToken
        case .failure(let error):
          operationError = error
        }
      }

      operation.fetchRecordZoneChangesResultBlock = { [weak self] result in
        if case .failure(let error) = result {
          continuation.resume(throwing: error)
          return
        }
        if let error = operationError {
          continuation.resume(throwing: error)
          return
        }
        let tokenString = try? self?.encodeChangeToken(latestToken)
        continuation.resume(returning: [
          "records": records,
          "changeToken": tokenString as Any
        ])
      }

      route.database.add(operation)
    }
  }

  private func pushRecords(zoneName: String, payloads: [[String: Any]]) async throws -> [String: Any] {
    var accepted: [[String: Any]] = []
    var conflicts: [[String: Any]] = []
    var batchSaves: [CKRecord] = []

    func flushBatchSaves() async throws {
      guard !batchSaves.isEmpty else { return }
      let savedRecords = try await saveRecords(batchSaves)
      accepted.append(contentsOf: savedRecords.map { self.payload(from: $0, zoneName: zoneName) })
      batchSaves.removeAll()
    }

    for payload in payloads {
      let recordName = string(payload["recordName"]) ?? UUID().uuidString
      let recordType = string(payload["recordType"]) ?? "transaction"
      let recordID = CKRecord.ID(recordName: recordName, zoneID: zoneID(zoneName))
      let localTag = string(payload["recordChangeTag"])
      let localDeletedAt = string(payload["deletedAt"])

      if localDeletedAt != nil {
        try await flushBatchSaves()
        do {
          _ = try await deleteRecord(recordID)
        } catch {
          if !Self.isNotFound(error) { throw error }
        }
        accepted.append(payload.merging([
          "recordChangeTag": NSNull(),
          "syncStatus": "synced"
        ]) { _, next in next })
        continue
      }

      if localTag == nil {
        let record = CKRecord(recordType: recordType, recordID: recordID)
        if let fields = payload["fields"] as? [String: Any] {
          apply(fields: fields, to: record)
        }
        applySyncMetadata(from: payload, to: record)
        batchSaves.append(record)
        if batchSaves.count >= 200 {
          try await flushBatchSaves()
        }
        continue
      }

      try await flushBatchSaves()
      let existing = try await fetchRecordIfExists(recordID)

      if let existing, let localTag, existing.recordChangeTag != localTag {
        conflicts.append([
          "local": payload,
          "remote": self.payload(from: existing, zoneName: zoneName),
          "reason": "remote-newer"
        ])
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
    try await flushBatchSaves()

    return [
      "accepted": accepted,
      "conflicts": conflicts
    ]
  }

  private func pushRecords(route: CloudKitDatabaseRoute, payloads: [[String: Any]]) async throws -> [String: Any] {
    var accepted: [[String: Any]] = []
    var conflicts: [[String: Any]] = []
    var batchSaves: [CKRecord] = []

    func flushBatchSaves() async throws {
      guard !batchSaves.isEmpty else { return }
      let savedRecords = try await saveRecords(batchSaves, in: route.database)
      accepted.append(contentsOf: savedRecords.map { self.payload(from: $0, zoneName: route.zoneName) })
      batchSaves.removeAll()
    }

    for payload in payloads {
      let recordName = string(payload["recordName"]) ?? UUID().uuidString
      let recordType = string(payload["recordType"]) ?? "transaction"
      let recordID = CKRecord.ID(recordName: recordName, zoneID: route.zoneID)
      let localTag = string(payload["recordChangeTag"])
      let localDeletedAt = string(payload["deletedAt"])

      if localDeletedAt != nil {
        try await flushBatchSaves()
        do {
          _ = try await deleteRecord(recordID, in: route.database)
        } catch {
          if !Self.isNotFound(error) { throw error }
        }
        accepted.append(payload.merging([
          "recordChangeTag": NSNull(),
          "syncStatus": "synced"
        ]) { _, next in next })
        continue
      }

      if localTag == nil {
        let record = CKRecord(recordType: recordType, recordID: recordID)
        if let fields = payload["fields"] as? [String: Any] {
          apply(fields: fields, to: record)
        }
        applySyncMetadata(from: payload, to: record)
        batchSaves.append(record)
        if batchSaves.count >= 200 {
          try await flushBatchSaves()
        }
        continue
      }

      try await flushBatchSaves()
      let existing = try await fetchRecordIfExists(recordID, in: route.database)

      if let existing, let localTag, existing.recordChangeTag != localTag {
        conflicts.append([
          "local": payload,
          "remote": self.payload(from: existing, zoneName: route.zoneName),
          "reason": "remote-newer"
        ])
        continue
      }

      let record = existing ?? CKRecord(recordType: recordType, recordID: recordID)
      if let fields = payload["fields"] as? [String: Any] {
        apply(fields: fields, to: record)
      }
      applySyncMetadata(from: payload, to: record)
      let saved = try await saveRecord(record, in: route.database)
      accepted.append(self.payload(from: saved, zoneName: route.zoneName))
    }
    try await flushBatchSaves()

    return [
      "accepted": accepted,
      "conflicts": conflicts
    ]
  }

  private func fetchRecordIfExists(_ recordID: CKRecord.ID, in database: CKDatabase? = nil) async throws -> CKRecord? {
    try await withCheckedThrowingContinuation { continuation in
      (database ?? self.database).fetch(withRecordID: recordID) { record, error in
        if let error {
          if Self.isNotFound(error) {
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

  private func saveRecords(_ records: [CKRecord], in database: CKDatabase? = nil) async throws -> [CKRecord] {
    guard !records.isEmpty else { return [] }
    return try await withCheckedThrowingContinuation { continuation in
      let operation = CKModifyRecordsOperation(recordsToSave: records, recordIDsToDelete: nil)
      operation.savePolicy = .changedKeys
      operation.isAtomic = false
      var savedRecords: [CKRecord] = []
      var operationError: Error?
      operation.perRecordSaveBlock = { _, saveResult in
        switch saveResult {
        case .success(let record):
          savedRecords.append(record)
        case .failure(let error):
          operationError = error
        }
      }
      operation.modifyRecordsResultBlock = { result in
        switch result {
        case .success:
          if let operationError {
            continuation.resume(throwing: operationError)
          } else {
            continuation.resume(returning: savedRecords)
          }
        case .failure(let error):
          continuation.resume(throwing: error)
        }
      }
      (database ?? self.database).add(operation)
    }
  }

  private func saveRecord(_ record: CKRecord, in database: CKDatabase? = nil) async throws -> CKRecord {
    try await withCheckedThrowingContinuation { continuation in
      (database ?? self.database).save(record) { saved, error in
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

  private func deleteRecord(_ recordID: CKRecord.ID, in database: CKDatabase? = nil) async throws -> CKRecord.ID {
    try await withCheckedThrowingContinuation { continuation in
      (database ?? self.database).delete(withRecordID: recordID) { deletedID, error in
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

  private static func isNotFound(_ error: Error) -> Bool {
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

private final class CloudKitSharingControllerDelegate: NSObject, UICloudSharingControllerDelegate {
  var itemTitle = "Shared finance ledger"

  func itemTitle(for csc: UICloudSharingController) -> String? {
    itemTitle
  }

  func itemType(for csc: UICloudSharingController) -> String? {
    "Finance ledger"
  }

  func itemThumbnailData(for csc: UICloudSharingController) -> Data? {
    let config = UIImage.SymbolConfiguration(pointSize: 44, weight: .semibold)
    let image = UIImage(systemName: "chart.pie.fill", withConfiguration: config)?
      .withTintColor(.systemBlue, renderingMode: .alwaysOriginal)
    return image?.pngData()
  }

  func cloudSharingController(_ csc: UICloudSharingController, failedToSaveShareWithError error: Error) {
    print("CloudKit share failed to save: \(error.localizedDescription)")
  }

  func cloudSharingControllerDidSaveShare(_ csc: UICloudSharingController) {}

  func cloudSharingControllerDidStopSharing(_ csc: UICloudSharingController) {}
}

private struct CloudKitDatabaseRoute {
  let database: CKDatabase
  let databaseScope: CloudKitDatabaseScope
  let zoneID: CKRecordZone.ID
  let zoneName: String
}

private enum CloudKitDatabaseScope {
  case privateScope
  case sharedScope

  var stringValue: String {
    switch self {
    case .privateScope:
      return "private"
    case .sharedScope:
      return "shared"
    }
  }
}

private final class CloudKitRemoteChangeStore {
  static let shared = CloudKitRemoteChangeStore()

  private let userDefaultsKey = "CloudKitSyncRemoteChanges"
  private let queue = DispatchQueue(label: "CloudKitSyncRemoteChangeStore")

  private init() {}

  func record(_ userInfo: [AnyHashable: Any]) -> Bool {
    guard let notification = CKNotification(fromRemoteNotificationDictionary: userInfo) else {
      return false
    }

    var payload: [String: Any] = [
      "reason": "remote-change",
      "subscriptionID": notification.subscriptionID ?? "",
      "receivedAt": ISO8601DateFormatter().string(from: Date())
    ]

    if let zoneNotification = notification as? CKRecordZoneNotification,
       let zoneID = zoneNotification.recordZoneID {
      payload["zoneName"] = zoneID.zoneName
      payload["ownerName"] = zoneID.ownerName
    }

    queue.sync {
      var values = UserDefaults.standard.array(forKey: userDefaultsKey) as? [[String: Any]] ?? []
      values.append(payload)
      if values.count > 50 {
        values = Array(values.suffix(50))
      }
      UserDefaults.standard.set(values, forKey: userDefaultsKey)
    }
    return true
  }

  func consume() -> [[String: Any]] {
    queue.sync {
      let values = UserDefaults.standard.array(forKey: userDefaultsKey) as? [[String: Any]] ?? []
      UserDefaults.standard.removeObject(forKey: userDefaultsKey)
      return values
    }
  }
}

private final class CloudKitAcceptedShareStore {
  static let shared = CloudKitAcceptedShareStore()

  private let userDefaultsKey = "CloudKitSyncAcceptedShares"
  private let queue = DispatchQueue(label: "CloudKitSyncAcceptedShareStore")

  private init() {}

  func accept(_ metadata: CKShare.Metadata) {
    Task {
      do {
        let payload = try await self.acceptShare(metadata)
        self.append(payload)
      } catch {
        self.append([
          "status": "failed",
          "containerIdentifier": metadata.containerIdentifier,
          "shareRecordName": metadata.share.recordID.recordName,
          "zoneName": metadata.share.recordID.zoneID.zoneName,
          "ownerName": metadata.share.recordID.zoneID.ownerName,
          "error": error.localizedDescription,
          "acceptedAt": ISO8601DateFormatter().string(from: Date())
        ])
      }
    }
  }

  func consume() -> [[String: Any]] {
    queue.sync {
      let values = UserDefaults.standard.array(forKey: userDefaultsKey) as? [[String: Any]] ?? []
      UserDefaults.standard.removeObject(forKey: userDefaultsKey)
      return values
    }
  }

  private func acceptShare(_ metadata: CKShare.Metadata) async throws -> [String: Any] {
    try await withCheckedThrowingContinuation { continuation in
      let operation = CKAcceptSharesOperation(shareMetadatas: [metadata])
      operation.qualityOfService = .userInteractive

      var acceptedShare: CKShare?
      var shareError: Error?
      operation.perShareResultBlock = { _, result in
        switch result {
        case .success(let share):
          acceptedShare = share
        case .failure(let error):
          shareError = error
        }
      }

      operation.acceptSharesResultBlock = { result in
        switch result {
        case .success:
          if let shareError {
            continuation.resume(throwing: shareError)
            return
          }
          guard let acceptedShare else {
            continuation.resume(throwing: CloudKitSyncError.missingAcceptedShare)
            return
          }
          continuation.resume(returning: self.payload(from: metadata, acceptedShare: acceptedShare))
        case .failure(let error):
          continuation.resume(throwing: error)
        }
      }

      CKContainer(identifier: metadata.containerIdentifier).add(operation)
    }
  }

  private func payload(from metadata: CKShare.Metadata, acceptedShare: CKShare) -> [String: Any] {
    let zoneID = acceptedShare.recordID.zoneID
    let zoneName = zoneID.zoneName
    let ownerName = zoneID.ownerName
    var payload: [String: Any] = [
      "status": "accepted",
      "databaseScope": "shared",
      "containerIdentifier": metadata.containerIdentifier,
      "ledgerId": ledgerId(from: zoneName),
      "zoneName": zoneName,
      "ownerName": ownerName,
      "shareRecordName": acceptedShare.recordID.recordName,
      "participantRole": roleString(metadata.participantRole),
      "participantStatus": statusString(metadata.participantStatus),
      "participantPermission": permissionString(metadata.participantPermission),
      "acceptedAt": ISO8601DateFormatter().string(from: Date())
    ]
    if let shareUrl = acceptedShare.url?.absoluteString {
      payload["shareUrl"] = shareUrl
    }
    return payload
  }

  private func append(_ payload: [String: Any]) {
    queue.sync {
      var values = UserDefaults.standard.array(forKey: userDefaultsKey) as? [[String: Any]] ?? []
      values.append(payload)
      UserDefaults.standard.set(values, forKey: userDefaultsKey)
    }
  }

  private func ledgerId(from zoneName: String) -> String {
    zoneName.hasPrefix("zone-") ? String(zoneName.dropFirst(5)) : zoneName
  }

  private func roleString(_ role: CKShare.ParticipantRole) -> String {
    switch role.rawValue {
    case 1:
      return "owner"
    case 2:
      return "administrator"
    case 3:
      return "privateUser"
    case 4:
      return "publicUser"
    case 0:
      return "unknown"
    default:
      return "unknown"
    }
  }

  private func statusString(_ status: CKShare.ParticipantAcceptanceStatus) -> String {
    switch status {
    case .accepted:
      return "accepted"
    case .pending:
      return "pending"
    case .removed:
      return "removed"
    case .unknown:
      return "unknown"
    @unknown default:
      return "unknown"
    }
  }

  private func permissionString(_ permission: CKShare.ParticipantPermission) -> String {
    switch permission.rawValue {
    case 1:
      return "none"
    case 2:
      return "readOnly"
    case 3:
      return "readWrite"
    case 0:
      return "unknown"
    default:
      return "unknown"
    }
  }
}

public final class CloudKitSyncAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if let metadata = launchOptions?[.cloudKitShareMetadata] as? CKShare.Metadata {
      CloudKitAcceptedShareStore.shared.accept(metadata)
    }
    return false
  }

  public func application(
    _ application: UIApplication,
    userDidAcceptCloudKitShareWith cloudKitShareMetadata: CKShare.Metadata
  ) {
    CloudKitAcceptedShareStore.shared.accept(cloudKitShareMetadata)
  }

  public func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    let recorded = CloudKitRemoteChangeStore.shared.record(userInfo)
    completionHandler(recorded ? .newData : .noData)
  }
}

private enum CloudKitSyncError: Error {
  case missingUserRecord
  case missingZone
  case missingRecord
  case invalidShareRecord
  case missingPresenter
  case missingSharedOwner
  case missingAcceptedShare
  case missingSubscription
}
