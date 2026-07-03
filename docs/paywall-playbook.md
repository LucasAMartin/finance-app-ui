# Paywall Playbook

This app uses RevenueCat for entitlement state and RevenueCat Paywalls for the
native purchase surface. Apple still handles iOS payment processing through
StoreKit.

RevenueCat paywall templates are configured in the RevenueCat dashboard and
rendered by `react-native-purchases-ui`; their template code is not copied into
this repository.

## Modes

Set `EXPO_PUBLIC_PAYWALL_MODE` before starting Expo:

```bash
EXPO_PUBLIC_PAYWALL_MODE=off npm start
EXPO_PUBLIC_PAYWALL_MODE=live npm start
```

- `off`: app is unlocked. This is the default in development.
- `live`: configures RevenueCat and presents the RevenueCat paywall if the user
  does not have the required entitlement. This is the default outside `__DEV__`.

## RevenueCat Environment

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
EXPO_PUBLIC_REVENUECAT_OFFERING_ID=default
```

`EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` defaults to `pro`.
`EXPO_PUBLIC_REVENUECAT_OFFERING_ID` defaults to `default`.

## Testing

Use `off` for app UI work. Use `live` with an Expo development build, Apple
Sandbox, or TestFlight to exercise native purchases without real charges. Expo
Go can preview SDK logic, but real StoreKit purchases require a native
development or TestFlight build.
