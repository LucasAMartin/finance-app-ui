# Native Glass Playbook

This note captures the iOS 26+ native glass implementation pattern used in this
app. Read this before adding or changing native Liquid Glass components.

## Goal

Use real SwiftUI / Expo UI Liquid Glass for iOS 26+ surfaces while preserving the
existing React Native UI shape, theme, spacing, and fallbacks for older devices.

The app should feel like the same finance app, just with native glass material,
native press physics, and native row interactions where iOS supports them.

## Core Gate

All iOS 26+ glass work is gated through `SUPPORTS_GLASS` in
`src/components/GlassButton.tsx`.

Use this gate for every native glass branch:

```ts
SUPPORTS_GLASS
```

Do not mount iOS 26 glass-only components outside that guard unless the native
view itself has an explicit fallback.

## Native Glass Rules

Do:

- Use `Host` around every SwiftUI tree from `@expo/ui/swift-ui`.
- Use `GlassEffectContainer` around interactive glass.
- Use a native SwiftUI `Button` as the press target when you want spring,
  finger-tracking, or refraction feedback.
- Keep native row/card dimensions explicit in virtualized or dynamically
  measured lists.
- Keep the RN fallback path in place for older iOS versions.
- Reuse `theme`, `makeP`, `SPACE`, `LAYOUT`, `RADIUS`, and category color helpers.
- Pass plain serializable props into native rows and cards.
- Run `npx tsc --noEmit` after TS changes.
- Run `pod install` after changing native module dependencies.
- Verify native module changes with an iOS build when possible.

Do not:

- Do not rely on a React Native `Pressable` to trigger native Liquid Glass
  interaction.
- Do not add `.buttonStyle(.plain)` to an interactive glass `Button`; it can
  remove the native interaction effect.
- Do not use `matchContents` for virtualized Activity list cards or dynamic
  containers where fixed height is known.
- Do not add per-row hooks inside virtualized native rows.
- Do not remove older-device fallbacks.
- Do not hardcode colors in native glass surfaces when a theme token or prop can
  supply the color.
- Do not redesign the visual hierarchy while porting a container native.

## Existing Native Pieces

`src/components/GlassButton.tsx`

- Defines `SUPPORTS_GLASS`.
- Provides `GlassCircleButton`, `GlassCircleIcon`, and `ScreenExitButton`.
- Pattern: an RN wrapper view contains a SwiftUI `Host`, `GlassEffectContainer`,
  and native `Button` / `Image`.

`modules/glass-card/ios/GlassCardView.swift`

- A hybrid native glass background with RN children layered above.
- Useful for simple glass-backed RN content.
- It does not make arbitrary RN foreground content fully native.
- Pressable cards route hits to a SwiftUI glass button so the native interaction
  fires.

`modules/glass-card/ios/NativeMerchantMarkView.swift`

- Fully native SwiftUI merchant/logo mark.
- Uses `AsyncImage` for cached logo URLs passed from JS.
- Falls back to an SF Symbol inside a colored circle.

`modules/glass-card/src/NativeMerchantMark.tsx`

- Thin JS wrapper for the native merchant mark view.
- Used inside native Home and Activity rows.

`src/merchantLogos.ts`

- Owns merchant logo resolution and cache policy.
- `useMerchantLogo(...)` is the original per-merchant hook for RN components.
- `useMerchantLogoMap(transactions, enabled)` is the native-row path. It resolves
  once per screen/list and returns a map keyed by `merchantLogoKey`.

## Current Screen Usage

Home screen:

- Native Upcoming container.
- Native Spending container.
- Native Activity container.
- Native merchant marks in native Activity rows.
- RN fallback containers remain for older devices.

Activity screen:

- Keeps virtualization.
- Native `NativeActivityDayGroup` renders fixed-height SwiftUI cards for iOS 26+.
- Each day group computes its own explicit `hostHeight`.
- Native rows use `SwiftButton`, `SwipeActions`, and `NativeMerchantMark`.
- RN `SectionCard` + `DayGroup` fallback remains.

Goals screen:

- Uses native SwiftUI cards and summary cards on iOS 26+.
- Keeps RN / `GlassCard` fallback elsewhere.

## Merchant Logo Pattern

For native rows, do not render the RN `MerchantMark` with `RNHostView` unless the
container is tiny and performance is not a concern.

Preferred pattern:

1. Call `useMerchantLogoMap(...)` once at the screen level.
2. During row data mapping, look up `merchantLogos.get(merchantLogoKey(tx.merchant))`.
3. Pass `logoUrl`, `logoBgColor`, fallback SF Symbol, and fallback colors into
   `NativeMerchantMark`.
4. Let the native view render `AsyncImage` or the fallback symbol.

This keeps the Activity list virtualized and avoids per-row repository
subscriptions.

## Virtualization Rules

For Activity and other virtualized screens:

- Keep row height constants near the top of the file.
- Keep card host heights explicit.
- Avoid `matchContents`.
- Keep `renderItem` stable with `useCallback`.
- Pass row data as plain values.
- Avoid nested RN hosts inside every native row.
- Preserve `removeClippedSubviews`, batching, and window settings unless there is
  a measured reason to change them.

## Adding A New Native Glass Container

Recommended sequence:

1. Identify the RN container and its exact fallback behavior.
2. Create a native data shape with plain values, callbacks, and accessibility
   strings.
3. Map existing app data into that native shape with `useMemo`.
4. Render `SUPPORTS_GLASS ? <NativeThing /> : <ExistingRNThing />`.
5. Use `Host` with explicit dimensions where possible.
6. Wrap the card/container in `GlassEffectContainer`.
7. Put `glassEffect({ glass: { variant: 'regular', interactive: true, tint }, ... })`
   on the native shape or button that owns the interaction.
8. Keep text sizes, spacing, colors, and row heights matched to the RN version.
9. Add native swipe/tap behavior only where the RN version already had that
   behavior.
10. Run TypeScript and a native build check.

## Adding A New Native Module View

Use the existing `modules/glass-card` local Expo module when the view belongs to
the native glass system.

Steps:

1. Add a SwiftUI view file under `modules/glass-card/ios`.
2. Import `ExpoModulesCore`, `ExpoUI`, and `SwiftUI` if using `ExpoUIView`.
3. Define a props class extending `UIBaseViewProps`.
4. Define a struct conforming to `ExpoSwiftUI.View`.
5. Register it in `GlassCardModule.swift` with `ExpoUIView(MyView.self)`.
6. Add a TS wrapper under `modules/glass-card/src`.
7. Add any new pod dependencies to `modules/glass-card/ios/GlassCard.podspec`.
8. Run `cd ios && pod install`.
9. Build the target or app.

Build check used successfully:

```bash
cd ios
xcodebuild -workspace financeapp.xcworkspace -scheme GlassCard -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build
```

## Known Pitfalls

- Native module dependency changes do not take effect until CocoaPods regenerates
  the Pods project. If Swift cannot resolve `ExpoUI`, run `cd ios && pod install`.
- Expo UI `Host matchContents` can cause update-depth or measurement loops in
  dynamic lists. Prefer explicit heights.
- RN content placed above glass will stay crisp but will not participate in the
  native foreground/refraction in the same way as SwiftUI content.
- RN content placed below glass can be blurred by the glass layer.
- Native `SwipeActions` are preferred for native rows; keep RN swipe rows for the
  fallback path.
- Remote merchant logos should be resolved and validated in JS, then rendered
  natively from the safe cached URL.

## Verification Checklist

Before handing off native glass work:

- `npx tsc --noEmit`
- `cd ios && pod install` if native dependencies changed
- `xcodebuild ... -scheme GlassCard ... build` for local module changes
- Run the app on an iOS 26+ simulator/device for visual and interaction checks
- Check an older iOS path or force fallback mentally/codewise to ensure RN
  fallback still exists
- For Activity, scroll enough rows to confirm virtualization stays smooth
- Tap rows and swipe rows to confirm native feedback still maps to the correct
  transaction
