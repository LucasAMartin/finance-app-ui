import ExpoModulesCore
import ExpoUI
import Foundation
import StoreKit
import WidgetKit

public class GlassCardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GlassCard")

    View(GlassCardView.self) {
      // Visual corner radius — should match RADIUS.card (24) or RADIUS.field (14).
      Prop("cornerRadius") { (view: GlassCardView, value: Double) in
        view.cornerRadius = CGFloat(value)
      }

      // Set to true when an onPress handler is wired up. Enables the SwiftUI
      // Button so the interactive spring + refraction animation fires on tap.
      Prop("pressable") { (view: GlassCardView, value: Bool) in
        view.isPressable = value
      }

      Events("onCardPress")
    }

    ExpoUIView(NativeMerchantMarkView.self)
    ExpoUIView(NativeStoreKitPaywallView.self)
    ExpoUIView(NativePayWallStoreKitDemoView.self)
    ExpoUIView(NativeIOSStyleOnboardingView.self)
    ExpoUIView(NativeBorderBeamMicButtonView.self)
    ExpoUIView(NativeCustomGlassTabBarView.self)
    ExpoUIView(NativeSkeletonView.self)
    ExpoUIView(NativeXStyleSideBarView.self)
    ExpoUIView(NativeDynamicHeightSheetView.self)
    ExpoUIView(NativeWallpaperCarouselView.self)
    ExpoUIView(NativeGlassSegmentedControlView.self)

    AsyncFunction("writeFinanceWidgetSnapshot") { (json: String) in
      guard let defaults = UserDefaults(suiteName: "group.com.lucasmartin.financeapp.widgets") else {
        return
      }
      defaults.set(json, forKey: "finance_widget_snapshot")
      defaults.set(Date().timeIntervalSince1970, forKey: "finance_widget_snapshot_updated_at")
      defaults.synchronize()

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    AsyncFunction("getStoreKitProducts") { (productIDs: [String]) async throws -> [[String: Any]] in
      guard #available(iOS 15.0, *) else {
        throw self.storeKitError("StoreKit 2 requires iOS 15 or newer.")
      }

      return try await self.storeKitProducts(productIDs: productIDs)
    }

    AsyncFunction("getStoreKitEntitlementStatus") { (productIDs: [String]) async throws -> [String: Any] in
      guard #available(iOS 15.0, *) else {
        throw self.storeKitError("StoreKit 2 requires iOS 15 or newer.")
      }

      return await self.storeKitEntitlementStatus(productIDs: productIDs)
    }

    AsyncFunction("purchaseStoreKitProduct") { (productID: String, productIDs: [String]) async throws -> [String: Any] in
      guard #available(iOS 15.0, *) else {
        throw self.storeKitError("StoreKit 2 requires iOS 15 or newer.")
      }

      return try await self.purchaseStoreKitProduct(productID: productID, productIDs: productIDs)
    }

    AsyncFunction("restoreStoreKitPurchases") { (productIDs: [String]) async throws -> [String: Any] in
      guard #available(iOS 15.0, *) else {
        throw self.storeKitError("StoreKit 2 requires iOS 15 or newer.")
      }

      try await AppStore.sync()
      return await self.storeKitEntitlementStatus(productIDs: productIDs)
    }
  }

  @available(iOS 15.0, *)
  private func storeKitProducts(productIDs: [String]) async throws -> [[String: Any]] {
    let ids = normalizedProductIDs(productIDs)
    let products = try await Product.products(for: ids)
    let productsByID = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })

    return ids.compactMap { id in
      guard let product = productsByID[id] else { return nil }
      return encodeStoreKitProduct(product)
    }
  }

  @available(iOS 15.0, *)
  private func purchaseStoreKitProduct(productID: String, productIDs: [String]) async throws -> [String: Any] {
    let trimmedProductID = productID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedProductID.isEmpty else {
      throw storeKitError("Missing StoreKit product ID.")
    }

    let products = try await Product.products(for: [trimmedProductID])
    guard let product = products.first else {
      throw storeKitError("StoreKit product \"\(trimmedProductID)\" was not found.")
    }

    let purchaseResult = try await product.purchase()
    let entitlementProductIDs = normalizedProductIDs(productIDs).isEmpty
      ? [trimmedProductID]
      : normalizedProductIDs(productIDs)

    switch purchaseResult {
    case .success(let verificationResult):
      let transaction = try verifiedTransaction(verificationResult)
      await transaction.finish()
      var status = await storeKitEntitlementStatus(productIDs: entitlementProductIDs)
      status["purchasedProductID"] = transaction.productID
      status["cancelled"] = false
      status["pending"] = false
      return status

    case .userCancelled:
      return [
        "isPremium": false,
        "activeProductID": "",
        "cancelled": true,
        "pending": false
      ]

    case .pending:
      return [
        "isPremium": false,
        "activeProductID": "",
        "cancelled": false,
        "pending": true
      ]

    @unknown default:
      return [
        "isPremium": false,
        "activeProductID": "",
        "cancelled": false,
        "pending": true
      ]
    }
  }

  @available(iOS 15.0, *)
  private func storeKitEntitlementStatus(productIDs: [String]) async -> [String: Any] {
    let ids = Set(normalizedProductIDs(productIDs))
    let now = Date()

    for await result in Transaction.currentEntitlements {
      guard case .verified(let transaction) = result else { continue }
      guard ids.isEmpty || ids.contains(transaction.productID) else { continue }
      guard transaction.revocationDate == nil else { continue }
      if let expirationDate = transaction.expirationDate, expirationDate <= now {
        continue
      }

      var status: [String: Any] = [
        "isPremium": true,
        "activeProductID": transaction.productID,
        "transactionID": String(transaction.id),
        "environment": transaction.environment.rawValue
      ]
      if let expirationDate = transaction.expirationDate {
        status["expirationDate"] = isoString(expirationDate)
      }
      return status
    }

    return [
      "isPremium": false,
      "activeProductID": ""
    ]
  }

  private func normalizedProductIDs(_ productIDs: [String]) -> [String] {
    var seen = Set<String>()
    return productIDs.compactMap { rawID in
      let id = rawID.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !id.isEmpty, !seen.contains(id) else { return nil }
      seen.insert(id)
      return id
    }
  }

  @available(iOS 15.0, *)
  private func encodeStoreKitProduct(_ product: Product) -> [String: Any] {
    var result: [String: Any] = [
      "id": product.id,
      "displayName": product.displayName,
      "description": product.description,
      "displayPrice": product.displayPrice
    ]

    if let subscription = product.subscription {
      result["subscriptionPeriodUnit"] = periodUnitString(subscription.subscriptionPeriod.unit)
      result["subscriptionPeriodValue"] = subscription.subscriptionPeriod.value

      if let introOffer = subscription.introductoryOffer {
        result["introOfferDisplayPrice"] = introOffer.displayPrice
        result["introOfferPeriodUnit"] = periodUnitString(introOffer.period.unit)
        result["introOfferPeriodValue"] = introOffer.period.value
      }
    }

    return result
  }

  @available(iOS 15.0, *)
  private func verifiedTransaction(_ result: VerificationResult<Transaction>) throws -> Transaction {
    switch result {
    case .verified(let transaction):
      return transaction
    case .unverified(_, let error):
      throw storeKitError("StoreKit could not verify the transaction: \(error.localizedDescription)")
    }
  }

  @available(iOS 15.0, *)
  private func periodUnitString(_ unit: Product.SubscriptionPeriod.Unit) -> String {
    switch unit {
    case .day:
      return "day"
    case .week:
      return "week"
    case .month:
      return "month"
    case .year:
      return "year"
    @unknown default:
      return "period"
    }
  }

  private func isoString(_ date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }

  private func storeKitError(_ message: String) -> NSError {
    NSError(
      domain: "GlassCardStoreKit",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }
}
