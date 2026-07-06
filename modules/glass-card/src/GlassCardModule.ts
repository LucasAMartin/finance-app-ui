import { NativeModule, requireNativeModule } from 'expo';

export type StoreKitProduct = {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  subscriptionPeriodUnit?: 'day' | 'week' | 'month' | 'year' | 'period';
  subscriptionPeriodValue?: number;
  introOfferDisplayPrice?: string;
  introOfferPeriodUnit?: 'day' | 'week' | 'month' | 'year' | 'period';
  introOfferPeriodValue?: number;
};

export type StoreKitEntitlementStatus = {
  isPremium: boolean;
  activeProductID?: string;
  transactionID?: string;
  environment?: string;
  expirationDate?: string;
  purchasedProductID?: string;
  cancelled?: boolean;
  pending?: boolean;
};

declare class GlassCardModule extends NativeModule<{}> {
  writeFinanceWidgetSnapshot(json: string): Promise<void>;
  getStoreKitProducts(productIDs: string[]): Promise<StoreKitProduct[]>;
  getStoreKitEntitlementStatus(productIDs: string[]): Promise<StoreKitEntitlementStatus>;
  purchaseStoreKitProduct(productID: string, productIDs: string[]): Promise<StoreKitEntitlementStatus>;
  restoreStoreKitPurchases(productIDs: string[]): Promise<StoreKitEntitlementStatus>;
}

export default requireNativeModule<GlassCardModule>('GlassCard');
