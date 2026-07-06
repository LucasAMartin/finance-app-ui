# Paywall Playbook

This app uses StoreKit 2 directly for iOS subscription products, purchases,
restores, and entitlement checks. The paywall UI is the app's custom native
SwiftUI surface in the `GlassCard` Expo module.

## Modes

Set `EXPO_PUBLIC_PAYWALL_MODE` before starting Expo:

```bash
EXPO_PUBLIC_PAYWALL_MODE=off npm start
EXPO_PUBLIC_PAYWALL_MODE=live npm start
```

- `off`: app is unlocked. This is the default in development.
- `live`: loads StoreKit products and presents the paywall if the user does not
  have an active subscription. This is the default outside `__DEV__`.

## StoreKit Environment

```bash
EXPO_PUBLIC_STOREKIT_PRODUCT_IDS=pro_weekly,pro_monthly,pro_yearly
EXPO_PUBLIC_PAYWALL_APP_NAME=App Name
EXPO_PUBLIC_PAYWALL_TITLE=Membership
EXPO_PUBLIC_PAYWALL_SUBTITLE=Lorem Ipsum is simply dummy text
EXPO_PUBLIC_PAYWALL_CTA_LABEL=Start 30 Day Free Trial
```

`EXPO_PUBLIC_STOREKIT_PRODUCT_IDS` is a comma-separated list of App Store
Connect product IDs. The product names, descriptions, prices, and periods are
loaded from StoreKit.

## Testing

Use `off` for app UI work. Use `live` with an Expo development build, Xcode
StoreKit testing, Apple Sandbox, or TestFlight to exercise native purchases
without real charges. Expo Go cannot run this StoreKit implementation because it
depends on the local native `GlassCard` module.
